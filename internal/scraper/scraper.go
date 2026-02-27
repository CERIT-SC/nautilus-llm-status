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

func (s *Scraper) scrape() {
	now := time.Now().UTC()
	mc := s.cfg.Metrics

	// 1. Discover models + get running requests (also serves as online detection)
	results, latency, err := s.prom.InstantQuery(
		fmt.Sprintf(`sum(%s) by (namespace, container, model_name)`, mc.NumRequestsRunning),
	)
	if err != nil {
		log.Printf("[scraper] prometheus error: %v", err)
		s.setHealth(false)
		s.store.RecordPrometheusHealth(false, int(latency.Milliseconds()), err.Error())
		return
	}
	s.setHealth(true)
	s.store.RecordPrometheusHealth(true, int(latency.Milliseconds()), "")

	// Build model map for this scrape
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
		metricRows = append(metricRows, storage.MetricRow{
			ModelID: id, MetricName: "num_requests_running", Timestamp: now, Value: val,
		})
	}

	// 2. Waiting requests
	s.scrapeGauge(mc.NumRequestsWaiting, "num_requests_waiting", "sum", models, now, &metricRows)

	// 3. KV cache (avg for percentages)
	s.scrapeGauge(mc.KVCacheUsagePerc, "kv_cache_usage_perc", "avg", models, now, &metricRows)

	// 4. GPU count per type
	s.scrapeGPU(models, now, &metricRows)

	// 5. Throughput (rate)
	s.scrapeRate(mc.GenerationTokens, "generation_tokens_rate", models, now, &metricRows)

	// 6. Latency p50 and p99
	s.scrapeLatency(mc.E2ELatencyHistogram, models, now, &metricRows)

	// Batch insert all metrics
	if err := s.store.InsertMetricBatch(metricRows); err != nil {
		log.Printf("[scraper] batch insert error: %v", err)
	}
}

func (s *Scraper) scrapeGauge(promMetric, storageName, aggFn string, models map[string]modelInfo, now time.Time, rows *[]storage.MetricRow) {
	query := fmt.Sprintf(`%s(%s) by (namespace, container)`, aggFn, promMetric)
	results, _, err := s.prom.InstantQuery(query)
	if err != nil {
		log.Printf("[scraper] %s query error: %v", storageName, err)
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
		*rows = append(*rows, storage.MetricRow{
			ModelID: m.id, MetricName: storageName, Timestamp: now, Value: val,
		})
	}
}

type modelInfo struct {
	id        int64
	namespace string
	container string
}

func (s *Scraper) scrapeGPU(models map[string]modelInfo, now time.Time, rows *[]storage.MetricRow) {
	mc := s.cfg.Metrics

	// GPU count per (namespace, container, GPU model)
	query := fmt.Sprintf(`count(%s) by (namespace, container, modelName)`, mc.GPUUtilization)
	results, _, err := s.prom.InstantQuery(query)
	if err != nil {
		log.Printf("[scraper] gpu count query error: %v", err)
		return
	}
	for _, r := range results {
		key := r.Metric["namespace"] + "/" + r.Metric["container"]
		m, ok := models[key]
		if !ok {
			continue
		}
		gpuModel := r.Metric["modelName"]
		_, val, err := ParseValue(r.Value)
		if err != nil {
			continue
		}
		*rows = append(*rows, storage.MetricRow{
			ModelID: m.id, MetricName: "gpu_count", LabelKey: gpuModel, Timestamp: now, Value: val,
		})
	}

	// GPU utilization avg per (namespace, container, GPU model)
	query = fmt.Sprintf(`avg(%s) by (namespace, container, modelName)`, mc.GPUUtilization)
	results, _, err = s.prom.InstantQuery(query)
	if err != nil {
		log.Printf("[scraper] gpu util query error: %v", err)
		return
	}
	for _, r := range results {
		key := r.Metric["namespace"] + "/" + r.Metric["container"]
		m, ok := models[key]
		if !ok {
			continue
		}
		gpuModel := r.Metric["modelName"]
		_, val, err := ParseValue(r.Value)
		if err != nil {
			continue
		}
		*rows = append(*rows, storage.MetricRow{
			ModelID: m.id, MetricName: "gpu_utilization", LabelKey: gpuModel, Timestamp: now, Value: val,
		})
	}
}

func (s *Scraper) scrapeRate(promMetric, storageName string, models map[string]modelInfo, now time.Time, rows *[]storage.MetricRow) {
	query := fmt.Sprintf(`sum(rate(%s[5m])) by (namespace, container)`, promMetric)
	results, _, err := s.prom.InstantQuery(query)
	if err != nil {
		log.Printf("[scraper] %s query error: %v", storageName, err)
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
		*rows = append(*rows, storage.MetricRow{
			ModelID: m.id, MetricName: storageName, Timestamp: now, Value: val,
		})
	}
}

func (s *Scraper) scrapeLatency(promMetric string, models map[string]modelInfo, now time.Time, rows *[]storage.MetricRow) {
	for _, pct := range []struct {
		quantile string
		label    string
	}{
		{"0.5", "p50"},
		{"0.99", "p99"},
	} {
		query := fmt.Sprintf(`histogram_quantile(%s, sum(rate(%s[5m])) by (le, namespace, container))`, pct.quantile, promMetric)
		results, _, err := s.prom.InstantQuery(query)
		if err != nil {
			log.Printf("[scraper] latency %s query error: %v", pct.label, err)
			continue
		}
		for _, r := range results {
			key := r.Metric["namespace"] + "/" + r.Metric["container"]
			m, ok := models[key]
			if !ok {
				continue
			}
			_, val, err := ParseValue(r.Value)
			if err != nil || math.IsNaN(val) || math.IsInf(val, 0) {
				continue
			}
			*rows = append(*rows, storage.MetricRow{
				ModelID: m.id, MetricName: "latency_seconds", LabelKey: pct.label, Timestamp: now, Value: val,
			})
		}
	}
}

func (s *Scraper) fillGaps() {
	log.Println("[gap-filler] checking for gaps...")
	mc := s.cfg.Metrics
	now := time.Now().UTC()
	sevenDaysAgo := now.Add(-7 * 24 * time.Hour)

	// Find the newest stored timestamp across all metrics
	newest, err := s.store.GetNewestMetricTimestamp("num_requests_running")
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

		err := s.backfillChunk(mc, start, end)
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

func (s *Scraper) backfillChunk(mc config.MetricsConfig, start, end time.Time) error {
	step := 30 * time.Second

	// Backfill running requests (also discovers models)
	query := fmt.Sprintf(`sum(%s) by (namespace, container, model_name)`, mc.NumRequestsRunning)
	results, err := s.prom.RangeQuery(query, start, end, step)
	if err != nil {
		return fmt.Errorf("range query: %w", err)
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
			allRows = append(allRows, storage.MetricRow{
				ModelID: id, MetricName: "num_requests_running", Timestamp: ts, Value: val,
			})
		}
	}

	// Backfill other gauge metrics
	for _, m := range []struct {
		prom    string
		name    string
		aggFn   string
	}{
		{mc.NumRequestsWaiting, "num_requests_waiting", "sum"},
		{mc.KVCacheUsagePerc, "kv_cache_usage_perc", "avg"},
	} {
		q := fmt.Sprintf(`%s(%s) by (namespace, container)`, m.aggFn, m.prom)
		rr, err := s.prom.RangeQuery(q, start, end, step)
		if err != nil {
			log.Printf("[gap-filler] %s range query error: %v", m.name, err)
			continue
		}
		for _, r := range rr {
			key := r.Metric["namespace"] + "/" + r.Metric["container"]
			id, ok := models[key]
			if !ok {
				continue
			}
			for _, v := range r.Values {
				ts, val, err := ParseValue(v)
				if err != nil {
					continue
				}
				allRows = append(allRows, storage.MetricRow{
					ModelID: id, MetricName: m.name, Timestamp: ts, Value: val,
				})
			}
		}
	}

	// Backfill GPU count
	q := fmt.Sprintf(`count(%s) by (namespace, container, modelName)`, mc.GPUUtilization)
	rr, err := s.prom.RangeQuery(q, start, end, step)
	if err != nil {
		log.Printf("[gap-filler] gpu count range query error: %v", err)
	} else {
		for _, r := range rr {
			key := r.Metric["namespace"] + "/" + r.Metric["container"]
			id, ok := models[key]
			if !ok {
				continue
			}
			gpuModel := r.Metric["modelName"]
			for _, v := range r.Values {
				ts, val, err := ParseValue(v)
				if err != nil {
					continue
				}
				allRows = append(allRows, storage.MetricRow{
					ModelID: id, MetricName: "gpu_count", LabelKey: gpuModel, Timestamp: ts, Value: val,
				})
			}
		}
	}

	// Backfill GPU utilization
	q = fmt.Sprintf(`avg(%s) by (namespace, container, modelName)`, mc.GPUUtilization)
	rr, err = s.prom.RangeQuery(q, start, end, step)
	if err != nil {
		log.Printf("[gap-filler] gpu util range query error: %v", err)
	} else {
		for _, r := range rr {
			key := r.Metric["namespace"] + "/" + r.Metric["container"]
			id, ok := models[key]
			if !ok {
				continue
			}
			gpuModel := r.Metric["modelName"]
			for _, v := range r.Values {
				ts, val, err := ParseValue(v)
				if err != nil {
					continue
				}
				allRows = append(allRows, storage.MetricRow{
					ModelID: id, MetricName: "gpu_utilization", LabelKey: gpuModel, Timestamp: ts, Value: val,
				})
			}
		}
	}

	// Backfill throughput rate
	q = fmt.Sprintf(`sum(rate(%s[5m])) by (namespace, container)`, mc.GenerationTokens)
	rr, err = s.prom.RangeQuery(q, start, end, step)
	if err != nil {
		log.Printf("[gap-filler] throughput range query error: %v", err)
	} else {
		for _, r := range rr {
			key := r.Metric["namespace"] + "/" + r.Metric["container"]
			id, ok := models[key]
			if !ok {
				continue
			}
			for _, v := range r.Values {
				ts, val, err := ParseValue(v)
				if err != nil {
					continue
				}
				allRows = append(allRows, storage.MetricRow{
					ModelID: id, MetricName: "generation_tokens_rate", Timestamp: ts, Value: val,
				})
			}
		}
	}

	// Backfill latency p50 and p99
	for _, pct := range []struct {
		quantile string
		label    string
	}{
		{"0.5", "p50"},
		{"0.99", "p99"},
	} {
		q = fmt.Sprintf(`histogram_quantile(%s, sum(rate(%s[5m])) by (le, namespace, container))`, pct.quantile, mc.E2ELatencyHistogram)
		rr, err = s.prom.RangeQuery(q, start, end, step)
		if err != nil {
			log.Printf("[gap-filler] latency %s range query error: %v", pct.label, err)
			continue
		}
		for _, r := range rr {
			key := r.Metric["namespace"] + "/" + r.Metric["container"]
			id, ok := models[key]
			if !ok {
				continue
			}
			for _, v := range r.Values {
				ts, val, err := ParseValue(v)
				if err != nil || math.IsNaN(val) || math.IsInf(val, 0) {
					continue
				}
				allRows = append(allRows, storage.MetricRow{
					ModelID: id, MetricName: "latency_seconds", LabelKey: pct.label, Timestamp: ts, Value: val,
				})
			}
		}
	}

	// Insert in batches of 10k to bound memory
	const batchSize = 10000
	for i := 0; i < len(allRows); i += batchSize {
		end := i + batchSize
		if end > len(allRows) {
			end = len(allRows)
		}
		if err := s.store.InsertMetricBatch(allRows[i:end]); err != nil {
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
