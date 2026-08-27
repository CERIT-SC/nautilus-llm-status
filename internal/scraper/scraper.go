package scraper

import (
	"fmt"
	"log"
	"math"
	"sync"
	"time"

	"github.com/nautilus-llm-status/internal/cache"
	"github.com/nautilus-llm-status/internal/config"
	"github.com/nautilus-llm-status/internal/storage"
)

type Scraper struct {
	prom    *PromClient
	store   *storage.Store
	cache   *cache.Cache
	cfg     *config.Config
	mu      sync.RWMutex
	healthy bool
	lastOK  time.Time
}

func New(prom *PromClient, store *storage.Store, c *cache.Cache, cfg *config.Config) *Scraper {
	return &Scraper{
		prom:  prom,
		store: store,
		cache: c,
		cfg:   cfg,
	}
}

func (s *Scraper) IsHealthy() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.healthy
}

func (s *Scraper) LastSuccess() time.Time {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.lastOK
}

func (s *Scraper) setHealth(healthy bool) {
	s.mu.Lock()
	s.healthy = healthy
	if healthy {
		s.lastOK = time.Now().UTC()
	}
	scraperHealthy := s.healthy
	scraperLastOK := s.lastOK
	s.mu.Unlock()

	// Also update cache health snapshot
	s.cache.UpdateHealth(scraperHealthy, scraperLastOK, healthy, scraperLastOK)
}

type modelInfo struct {
	id        int64
	namespace string
	container string
}

// Run starts the periodic scraper. Blocks until done channel is closed.
// Waits for the gap-filler goroutine to finish before returning.
func (s *Scraper) Run(done <-chan struct{}) {
	// Immediate first scrape (so health goes green fast)
	s.scrape()

	// Run gap filler in background
	gapsDone := make(chan struct{})
	go func() {
		s.fillGaps(done)
		// Gap-fill finished: the service is now ready to receive traffic.
		s.cache.SetReady(true)
		close(gapsDone)
	}()

	ticker := time.NewTicker(s.cfg.Prometheus.ScrapeInterval)
	defer ticker.Stop()

	// Daily compaction
	compactTicker := time.NewTicker(24 * time.Hour)
	defer compactTicker.Stop()

	for {
		select {
		case <-done:
			<-gapsDone // Wait for gap-filler to finish before returning
			return
		case <-ticker.C:
			s.scrape()
		case <-compactTicker.C:
			s.compact()
		}
	}
}

// discoveryRule returns the first rule with Discovery: true.
func discoveryRule(rules []config.ScrapeRule) *config.ScrapeRule {
	for i := range rules {
		if rules[i].Discovery {
			return &rules[i]
		}
	}
	return nil
}

func (s *Scraper) scrape() {
	now := time.Now().UTC()
	rules := s.cfg.Metrics.ScrapeRules

	disc := discoveryRule(rules)
	if disc == nil {
		log.Println("[scraper] no discovery rule configured")
		return
	}

	// 1. Run discovery query to find models
	results, latency, err := s.prom.InstantQuery(disc.Query)
	if err != nil {
		log.Printf("[scraper] prometheus error: %v", err)
		s.setHealth(false)
		s.store.RecordPrometheusHealth(false, int(latency.Milliseconds()), err.Error())
		return
	}
	s.store.RecordPrometheusHealth(true, int(latency.Milliseconds()), "")

	// Build model map and collect discovery metric rows
	models := make(map[string]modelInfo) // key: "model_name"
	var metricRows []storage.MetricRow

	for _, r := range results {
		log.Printf("Metrics: %v", r.Metric)
		ns := "vllm-ns"
		ctr := r.Metric["model_name"]
		modelName := r.Metric["model_name"]
		_, val, err := ParseValue(r.Value)
		if err != nil {
			log.Printf("[scraper] parse value error: %v", err)
			continue
		}

		id, err := s.store.UpsertModel(ns, ctr, modelName, now)
		if err != nil {
			log.Printf("[scraper] upsert model error: %v", err)
			continue
		}

		key := modelName
		models[key] = modelInfo{id: id, namespace: ns, container: ctr}

		labelKey := ""
		if disc.LabelKey != "" {
			labelKey = r.Metric[disc.LabelKey]
		}
		metricRows = append(metricRows, storage.MetricRow{
			ModelID: id, MetricName: disc.StorageName, LabelKey: labelKey, Timestamp: now, Value: val,
		})
	}

	// 2. Run all non-discovery rules
	for _, rule := range rules {
		if rule.Discovery {
			continue // already handled above
		}
		s.scrapeRule(rule, models, now, &metricRows)
	}

	// Batch insert all metrics — only update cache on success to prevent ghost data
	if err := s.store.InsertMetricBatch(metricRows); err != nil {
		log.Printf("[scraper] batch insert error: %v", err)
		s.setHealth(false)
		return
	}
	s.setHealth(true)

	// Feed cache with scrape results (DB write succeeded)
	cacheModels := make(map[string]cache.ModelInfo)
	for key, m := range models {
		cacheModels[key] = cache.ModelInfo{
			ID: m.id, Namespace: m.namespace, Container: m.container,
		}
		// Propagate model_name from discovery results
		for _, r := range results {
			if r.Metric["model_name"] == key {
				cacheModels[key] = cache.ModelInfo{
					ID: m.id, Namespace: m.namespace, Container: m.container,
					ModelName: r.Metric["model_name"],
				}
				break
			}
		}
	}
	s.cache.IngestScrapeResults(&cache.ScrapeResult{
		Timestamp: now,
		Models:    cacheModels,
		Rows:      metricRows,
	})

	// Update health cache
	s.cache.UpdateHealth(s.IsHealthy(), s.LastSuccess(), true, now)
}

// scrapeRule runs a single ScrapeRule instant query and appends results.
func (s *Scraper) scrapeRule(rule config.ScrapeRule, models map[string]modelInfo, now time.Time, rows *[]storage.MetricRow) {
	results, _, err := s.prom.InstantQuery(rule.Query)
	if err != nil {
		log.Printf("[scraper] %s query error: %v", rule.StorageName, err)
		return
	}
	for _, r := range results {
		key := r.Metric["model_name"]
		m, ok := models[key]
		if !ok {
			continue
		}
		_, val, err := ParseValue(r.Value)
		if err != nil {
			continue
		}
		if rule.SkipNaN && (math.IsNaN(val) || math.IsInf(val, 0)) {
			continue
		}
		labelKey := ""
		if rule.LabelKey != "" {
			labelKey = r.Metric[rule.LabelKey]
		}
		*rows = append(*rows, storage.MetricRow{
			ModelID: m.id, MetricName: rule.StorageName, LabelKey: labelKey, Timestamp: now, Value: val,
		})
	}
}

func (s *Scraper) fillGaps(done <-chan struct{}) {
	rules := s.cfg.Metrics.ScrapeRules
	now := time.Now().UTC()
	fillFrom := now.Add(-30 * 24 * time.Hour)

	disc := discoveryRule(rules)
	if disc == nil {
		log.Println("[gap-filler] no discovery rule configured")
		return
	}

	log.Println("[gap-filler] backfilling 30 days from Prometheus...")

	// Backfill in 7-day chunks, newest first
	chunkSize := time.Hour * 24
	backoff := time.Second

	chunksProcessed := 0
	for end := now; end.After(fillFrom); end = end.Add(-chunkSize) {
		// Check for shutdown
		select {
		case <-done:
			log.Println("[gap-filler] shutdown requested, stopping")
			return
		default:
		}

		start := end.Add(-chunkSize)
		if start.Before(fillFrom) {
			start = fillFrom
		}

		err := s.backfillChunk(rules, start, end)
		if err != nil {
			log.Printf("[gap-filler] chunk error: %v, backing off %s", err, backoff)
			time.Sleep(backoff)
			backoff = time.Duration(math.Min(float64(backoff*2), float64(60*time.Second)))
			continue
		}
		backoff = time.Second // reset on success
		chunksProcessed++

		// Rehydrate uptime from SQLite every 6 chunks (~6 hours of data)
		// so the UI fills in progressively rather than staying all-red
		if chunksProcessed%6 == 0 {
			s.cache.Rehydrate(s.store)
		}

		// Yield between chunks so write contention is minimized
		time.Sleep(500 * time.Millisecond)
	}

	// Final rehydrate after all backfill is done
	s.cache.Rehydrate(s.store)
	log.Println("[gap-filler] done")
}

func (s *Scraper) backfillChunk(rules []config.ScrapeRule, start, end time.Time) error {
	step := s.cfg.Prometheus.ScrapeInterval
	if step <= 0 {
		step = 30 * time.Second
	}

	disc := discoveryRule(rules)
	if disc == nil {
		return fmt.Errorf("no discovery rule configured")
	}

	// Backfill discovery rule first (discovers models)
	results, err := s.prom.RangeQuery(disc.Query, start, end, step)
	if err != nil {
		return fmt.Errorf("discovery range query: %w", err)
	}

	var allRows []storage.MetricRow
	models := make(map[string]int64) // key -> model ID

	for _, r := range results {
		ns := "vllm-ns"
		ctr := r.Metric["model_name"]
		modelName := r.Metric["model_name"]

		// Use earliest value timestamp for first_seen
		var earliest time.Time
		for _, v := range r.Values {
			ts, _, err := ParseValue(v)
			if err != nil {
				continue
			}
			if earliest.IsZero() || ts.Before(earliest) {
				earliest = ts
			}
		}

		id, err := s.store.UpsertModel(ns, ctr, modelName, earliest)
		if err != nil {
			continue
		}
		key := modelName
		models[key] = id

		for _, v := range r.Values {
			ts, val, err := ParseValue(v)
			if err != nil {
				continue
			}
			labelKey := ""
			if disc.LabelKey != "" {
				labelKey = r.Metric[disc.LabelKey]
			}
			allRows = append(allRows, storage.MetricRow{
				ModelID: id, MetricName: disc.StorageName, LabelKey: labelKey, Timestamp: ts, Value: val,
			})
		}
	}

	// Backfill all non-discovery rules
	for _, rule := range rules {
		if rule.Discovery {
			continue
		}
		rr, err := s.prom.RangeQuery(rule.Query, start, end, step)
		if err != nil {
			log.Printf("[gap-filler] %s range query error: %v", rule.StorageName, err)
			continue
		}
		for _, r := range rr {
			key := r.Metric["model_name"]
			id, ok := models[key]
			if !ok {
				continue
			}
			labelKey := ""
			if rule.LabelKey != "" {
				labelKey = r.Metric[rule.LabelKey]
			}
			for _, v := range r.Values {
				ts, val, err := ParseValue(v)
				if err != nil {
					continue
				}
				if rule.SkipNaN && (math.IsNaN(val) || math.IsInf(val, 0)) {
					continue
				}
				allRows = append(allRows, storage.MetricRow{
					ModelID: id, MetricName: rule.StorageName, LabelKey: labelKey, Timestamp: ts, Value: val,
				})
			}
		}
	}

	// Insert in batches of 10k to bound memory.
	// Sleep between batches to reduce WAL lock contention with read queries.
	const batchSize = 10000
	for i := 0; i < len(allRows); i += batchSize {
		batchEnd := i + batchSize
		if batchEnd > len(allRows) {
			batchEnd = len(allRows)
		}
		if err := s.store.InsertMetricBatch(allRows[i:batchEnd]); err != nil {
			return fmt.Errorf("batch insert: %w", err)
		}
		if batchEnd < len(allRows) {
			time.Sleep(100 * time.Millisecond)
		}
	}
	return nil
}

func (s *Scraper) compact() {
	log.Println("[compaction] starting...")
	cc := s.cfg.Compaction
	if err := s.store.Compact(cc.RawRetention, cc.MediumRetention, cc.MediumResolution, cc.CoarseRetention, cc.CoarseResolution); err != nil {
		log.Printf("[compaction] error: %v", err)
		return
	}
	// No VACUUM here — it blocks the DB for too long.
	// Space is reclaimed via incremental auto_vacuum (set at DB open).
	log.Println("[compaction] done")
}
