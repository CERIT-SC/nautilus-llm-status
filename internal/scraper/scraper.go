package scraper

import (
	"fmt"
	"log"
	"math"
	"sync"
	"time"

	"github.com/nautilus-llm-status/internal/config"
	"github.com/nautilus-llm-status/internal/storage"
)

type Scraper struct {
	prom    *PromClient
	store   *storage.Store
	cfg     *config.Config
	mu      sync.RWMutex
	healthy bool
	lastOK  time.Time
}

func New(prom *PromClient, store *storage.Store, cfg *config.Config) *Scraper {
	return &Scraper{
		prom:  prom,
		store: store,
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
	defer s.mu.Unlock()
	s.healthy = healthy
	if healthy {
		s.lastOK = time.Now().UTC()
	}
}

type modelInfo struct {
	id        int64
	namespace string
	container string
}

// Run starts the periodic scraper. Blocks until done channel is closed.
func (s *Scraper) Run(done <-chan struct{}) {
	// Run gap filler first
	s.fillGaps()

	// Immediate first scrape
	s.scrape()

	ticker := time.NewTicker(s.cfg.Prometheus.ScrapeInterval)
	defer ticker.Stop()

	// Daily compaction
	compactTicker := time.NewTicker(24 * time.Hour)
	defer compactTicker.Stop()

	for {
		select {
		case <-done:
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
	s.setHealth(true)
	s.store.RecordPrometheusHealth(true, int(latency.Milliseconds()), "")

	// Build model map and collect discovery metric rows
	models := make(map[string]modelInfo) // key: "namespace/container"
	var metricRows []storage.MetricRow

	for _, r := range results {
		ns := r.Metric["namespace"]
		ctr := r.Metric["container"]
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

		key := ns + "/" + ctr
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

	// Batch insert all metrics
	if err := s.store.InsertMetricBatch(metricRows); err != nil {
		log.Printf("[scraper] batch insert error: %v", err)
	}
}

// scrapeRule runs a single ScrapeRule instant query and appends results.
func (s *Scraper) scrapeRule(rule config.ScrapeRule, models map[string]modelInfo, now time.Time, rows *[]storage.MetricRow) {
	results, _, err := s.prom.InstantQuery(rule.Query)
	if err != nil {
		log.Printf("[scraper] %s query error: %v", rule.StorageName, err)
		return
	}
	for _, r := range results {
		key := r.Metric["namespace"] + "/" + r.Metric["container"]
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

func (s *Scraper) fillGaps() {
	log.Println("[gap-filler] checking for gaps...")
	rules := s.cfg.Metrics.ScrapeRules
	now := time.Now().UTC()
	sevenDaysAgo := now.Add(-7 * 24 * time.Hour)

	disc := discoveryRule(rules)
	if disc == nil {
		log.Println("[gap-filler] no discovery rule configured")
		return
	}

	// Find the newest stored timestamp from the discovery metric
	newest, err := s.store.GetNewestMetricTimestamp(disc.StorageName)
	if err != nil {
		log.Printf("[gap-filler] error getting newest timestamp: %v", err)
	}

	var fillFrom time.Time
	if newest.IsZero() {
		fillFrom = sevenDaysAgo
		log.Println("[gap-filler] no existing data, backfilling 7 days")
	} else if newest.Before(now.Add(-time.Minute)) {
		fillFrom = newest
		log.Printf("[gap-filler] filling gap from %s to now", fillFrom.Format(time.RFC3339))
	} else {
		log.Println("[gap-filler] no gap detected")
		return
	}

	// Backfill in 1-hour chunks, newest first
	chunkSize := time.Hour
	backoff := time.Second

	for end := now; end.After(fillFrom); end = end.Add(-chunkSize) {
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
	}
	log.Println("[gap-filler] done")
}

func (s *Scraper) backfillChunk(rules []config.ScrapeRule, start, end time.Time) error {
	step := 30 * time.Second

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
		ns := r.Metric["namespace"]
		ctr := r.Metric["container"]
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
		key := ns + "/" + ctr
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
			key := r.Metric["namespace"] + "/" + r.Metric["container"]
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

	// Insert in batches of 10k to bound memory
	const batchSize = 10000
	for i := 0; i < len(allRows); i += batchSize {
		batchEnd := i + batchSize
		if batchEnd > len(allRows) {
			batchEnd = len(allRows)
		}
		if err := s.store.InsertMetricBatch(allRows[i:batchEnd]); err != nil {
			return fmt.Errorf("batch insert: %w", err)
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
	if err := s.store.Vacuum(); err != nil {
		log.Printf("[compaction] vacuum error: %v", err)
	}
	log.Println("[compaction] done")
}
