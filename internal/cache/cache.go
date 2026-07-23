package cache

import (
	"encoding/json"
	"log"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/nautilus-llm-status/internal/config"
	"github.com/nautilus-llm-status/internal/storage"
)

// MetricPoint mirrors storage.MetricPoint for cache use.
type MetricPoint struct {
	Timestamp time.Time `json:"timestamp"`
	Value     float64   `json:"value"`
}

// LabeledSeries mirrors storage.LabeledSeries.
type LabeledSeries struct {
	Label  string        `json:"label"`
	Points []MetricPoint `json:"points"`
}

// modelEntry holds in-memory model state.
type modelEntry struct {
	ID        int64
	Namespace string
	Container string
	ModelName string
	FirstSeen time.Time
	LastSeen  time.Time
}

// uptimeTracker tracks data point counts per 30-min bucket for a model.
type uptimeTracker struct {
	counts   [48]int
	baseTime time.Time // start of bucket[0]
}

const (
	uptimeBuckets    = 48
	uptimeBucketMins = 30
	uptimeBucketSec  = uptimeBucketMins * 60
)

// Cache holds all in-memory state for serving API requests without SQLite.
type Cache struct {
	cfg *config.Config

	// Pre-serialized JSON responses (lock-free reads)
	modelsJSON      atomic.Value // []byte
	metricsMetaJSON atomic.Value // []byte
	configJSON      atomic.Value // []byte
	healthJSON      atomic.Value // []byte

	// Model registry
	modelsMu sync.RWMutex
	models   map[int64]*modelEntry          // id -> entry
	modelKey map[string]int64               // "namespace/container" -> id

	// Time series: modelID -> metricName -> labelKey -> []MetricPoint
	seriesMu sync.RWMutex
	series   map[int64]map[string]map[string][]MetricPoint

	// Uptime trackers: modelID -> tracker
	uptimeMu sync.RWMutex
	uptime   map[int64]*uptimeTracker

	// Derived config
	discoveryMetric string
	scalarSummary   []string
	labeledSummary  []string
	allSummary      []string
	scrapeInterval  time.Duration
}

// New creates a new cache and pre-computes static responses.
func New(cfg *config.Config) *Cache {
	c := &Cache{
		cfg:      cfg,
		models:   make(map[int64]*modelEntry),
		modelKey: make(map[string]int64),
		series:   make(map[int64]map[string]map[string][]MetricPoint),
		uptime:   make(map[int64]*uptimeTracker),
		scrapeInterval: cfg.Prometheus.ScrapeInterval,
	}

	// Derive metric lists from config (use first discovery rule, matching scraper)
	for _, rule := range cfg.Metrics.ScrapeRules {
		if rule.Discovery && c.discoveryMetric == "" {
			c.discoveryMetric = rule.StorageName
		}
		if !rule.Summary {
			continue
		}
		if rule.LabelKey != "" {
			c.labeledSummary = append(c.labeledSummary, rule.StorageName)
		} else {
			c.scalarSummary = append(c.scalarSummary, rule.StorageName)
		}
	}
	c.allSummary = append(append([]string{}, c.scalarSummary...), c.labeledSummary...)

	// Pre-compute static JSON responses
	c.buildMetricsMetaJSON()
	c.buildConfigJSON()

	return c
}

// --- Static JSON builders (called once at startup) ---

func (c *Cache) buildMetricsMetaJSON() {
	type metricMeta struct {
		StorageName  string  `json:"storage_name"`
		DisplayName  string  `json:"display_name"`
		Unit         string  `json:"unit,omitempty"`
		DisplayScale float64 `json:"display_scale,omitempty"`
		HasLabels    bool    `json:"has_labels"`
		Summary      bool    `json:"summary"`
	}
	var metrics []metricMeta
	for _, rule := range c.cfg.Metrics.ScrapeRules {
		metrics = append(metrics, metricMeta{
			StorageName:  rule.StorageName,
			DisplayName:  rule.DisplayName,
			Unit:         rule.Unit,
			DisplayScale: rule.DisplayScale,
			HasLabels:    rule.LabelKey != "",
			Summary:      rule.Summary,
		})
	}
	data, _ := json.Marshal(metrics)
	c.metricsMetaJSON.Store(data)
}

func (c *Cache) buildConfigJSON() {
	data, _ := json.Marshal(map[string]interface{}{
		"header":               c.cfg.UI.Header,
		"logo":                 c.cfg.UI.Logo,
		"announcement_message": c.cfg.UI.AnnouncementMessage,
		"announcement_type":    c.cfg.UI.AnnouncementType,
	})
	c.configJSON.Store(data)
}

// --- Startup hydration from SQLite ---

// HydrateFromStore loads initial state from SQLite on startup.
func (c *Cache) HydrateFromStore(store *storage.Store) error {
	// 1. Load models
	models, err := store.GetModels()
	if err != nil {
		return err
	}

	c.modelsMu.Lock()
	for _, m := range models {
		entry := &modelEntry{
			ID: m.ID, Namespace: m.Namespace, Container: m.Container,
			ModelName: m.ModelName, FirstSeen: m.FirstSeen, LastSeen: m.LastSeen,
		}
		c.models[m.ID] = entry
		c.modelKey[m.Namespace+"/"+m.Container] = m.ID
	}
	c.modelsMu.Unlock()

	// 2. Load time series for all metrics (last 30 days for detail pages).
	// Downsample each series immediately after loading to bound peak memory.
	now := time.Now().UTC()
	thirtyDaysAgo := now.Add(-30 * 24 * time.Hour)
	coarseBoundary := now.Add(-7 * 24 * time.Hour)
	medBoundary := now.Add(-2 * 24 * time.Hour)

	c.seriesMu.Lock()
	for _, m := range models {
		for _, rule := range c.cfg.Metrics.ScrapeRules {
			series, err := store.GetMetrics(m.ID, rule.StorageName, thirtyDaysAgo, now)
			if err != nil {
				log.Printf("[cache] hydrate series error for model %d/%s: %v", m.ID, rule.StorageName, err)
				continue
			}
			for _, ls := range series {
				c.ensureSeriesMap(m.ID, rule.StorageName)
				points := make([]MetricPoint, len(ls.Points))
				for i, p := range ls.Points {
					points[i] = MetricPoint{Timestamp: p.Timestamp, Value: p.Value}
				}
				// Downsample immediately to bound peak memory (don't accumulate raw data)
				c.series[m.ID][rule.StorageName][ls.Label] = downsamplePoints(points, coarseBoundary, medBoundary)
			}
		}
	}
	c.seriesMu.Unlock()

	// 3. Compute initial uptime buckets from loaded series
	c.uptimeMu.Lock()
	scrapeIntervalSec := int(c.scrapeInterval.Seconds())
	for _, m := range models {
		c.uptime[m.ID] = c.buildInitialUptime(m.ID, scrapeIntervalSec)
	}
	c.uptimeMu.Unlock()

	// 5. Build initial models JSON
	c.RebuildModelsJSON()

	log.Printf("[cache] hydrated: %d models, series loaded", len(models))
	return nil
}

func (c *Cache) ensureSeriesMap(modelID int64, metricName string) {
	if c.series[modelID] == nil {
		c.series[modelID] = make(map[string]map[string][]MetricPoint)
	}
	if c.series[modelID][metricName] == nil {
		c.series[modelID][metricName] = make(map[string][]MetricPoint)
	}
}

// buildUptimeFromSeries computes uptime from a given series map (caller provides data, no lock needed).
func (c *Cache) buildUptimeFromSeries(modelID int64, scrapeIntervalSec int, series map[int64]map[string]map[string][]MetricPoint) *uptimeTracker {
	now := time.Now().UTC()
	base := uptimeBase(now)
	tracker := &uptimeTracker{baseTime: base}
	bucketDur := time.Duration(uptimeBucketMins) * time.Minute

	if metrics, ok := series[modelID]; ok {
		if labels, ok := metrics[c.discoveryMetric]; ok {
			for _, points := range labels {
				for _, p := range points {
					if p.Timestamp.Before(base) || p.Timestamp.After(now) {
						continue
					}
					bucketStart := p.Timestamp.UTC().Truncate(bucketDur)
					idx := int(bucketStart.Sub(base) / bucketDur)
					if idx >= 0 && idx < uptimeBuckets {
						tracker.counts[idx]++
					}
				}
			}
		}
	}
	return tracker
}

// buildInitialUptime computes uptime from cached series data (must hold seriesMu).
func (c *Cache) buildInitialUptime(modelID int64, scrapeIntervalSec int) *uptimeTracker {
	return c.buildUptimeFromSeries(modelID, scrapeIntervalSec, c.series)
}

// Rehydrate reloads all cache state (models, series, uptime) from SQLite.
// Called after gap-filler populates historical data so the cache reflects
// what's in the database, not just what arrived via real-time scrapes.
func (c *Cache) Rehydrate(store *storage.Store) {
	models, err := store.GetModels()
	if err != nil {
		log.Printf("[cache] rehydrate models error: %v", err)
		return
	}

	thirtyDaysAgo := time.Now().UTC().Add(-30 * 24 * time.Hour)
	now := time.Now().UTC()

	// Reload models
	c.modelsMu.Lock()
	for _, m := range models {
		if existing, ok := c.models[m.ID]; ok {
			// Merge: keep the latest LastSeen between cache and DB
			if m.LastSeen.After(existing.LastSeen) {
				existing.LastSeen = m.LastSeen
			}
			if m.FirstSeen.Before(existing.FirstSeen) || existing.FirstSeen.IsZero() {
				existing.FirstSeen = m.FirstSeen
			}
			if m.ModelName != "" {
				existing.ModelName = m.ModelName
			}
		} else {
			c.models[m.ID] = &modelEntry{
				ID: m.ID, Namespace: m.Namespace, Container: m.Container,
				ModelName: m.ModelName, FirstSeen: m.FirstSeen, LastSeen: m.LastSeen,
			}
			c.modelKey[m.Namespace+"/"+m.Container] = m.ID
		}
	}
	c.modelsMu.Unlock()

	// Build new series from SQLite (off-lock, this is the slow part)
	newSeries := make(map[int64]map[string]map[string][]MetricPoint)
	for _, m := range models {
		for _, rule := range c.cfg.Metrics.ScrapeRules {
			series, err := store.GetMetrics(m.ID, rule.StorageName, thirtyDaysAgo, now)
			if err != nil {
				continue
			}
			for _, ls := range series {
				if newSeries[m.ID] == nil {
					newSeries[m.ID] = make(map[string]map[string][]MetricPoint)
				}
				if newSeries[m.ID][rule.StorageName] == nil {
					newSeries[m.ID][rule.StorageName] = make(map[string][]MetricPoint)
				}
				points := make([]MetricPoint, len(ls.Points))
				for i, p := range ls.Points {
					points[i] = MetricPoint{Timestamp: p.Timestamp, Value: p.Value}
				}
				newSeries[m.ID][rule.StorageName][ls.Label] = points
			}
		}
	}

	// Build uptime from newSeries off-lock (avoids holding seriesMu during rebuild)
	scrapeIntervalSec := int(c.scrapeInterval.Seconds())
	if scrapeIntervalSec <= 0 {
		scrapeIntervalSec = 30
	}
	newUptime := make(map[int64]*uptimeTracker)
	for _, m := range models {
		newUptime[m.ID] = c.buildUptimeFromSeries(m.ID, scrapeIntervalSec, newSeries)
	}

	// Swap series under lock, merging any real-time points that arrived during reload.
	// This prevents IngestScrapeResults data from being silently dropped.
	c.seriesMu.Lock()
	for modelID, metrics := range c.series {
		for metricName, labels := range metrics {
			for label, oldPoints := range labels {
				if len(oldPoints) == 0 {
					continue
				}
				// Find max timestamp in newSeries for this key
				var maxNewTS time.Time
				if newSeries[modelID] != nil && newSeries[modelID][metricName] != nil {
					if newPts := newSeries[modelID][metricName][label]; len(newPts) > 0 {
						maxNewTS = newPts[len(newPts)-1].Timestamp
					}
				}
				// Append any old cache points newer than what SQLite returned
				for _, p := range oldPoints {
					if p.Timestamp.After(maxNewTS) {
						if newSeries[modelID] == nil {
							newSeries[modelID] = make(map[string]map[string][]MetricPoint)
						}
						if newSeries[modelID][metricName] == nil {
							newSeries[modelID][metricName] = make(map[string][]MetricPoint)
						}
						newSeries[modelID][metricName][label] = append(
							newSeries[modelID][metricName][label], p,
						)
					}
				}
			}
		}
	}
	c.series = newSeries
	c.seriesMu.Unlock()

	// Swap uptime under its own lock (quick pointer swap, no rebuild)
	c.uptimeMu.Lock()
	c.uptime = newUptime
	c.uptimeMu.Unlock()

	// Downsample older data to bound memory after rehydration
	c.trimSeries()

	c.RebuildModelsJSON()
	log.Printf("[cache] rehydrated: %d models, all series + uptime refreshed from SQLite", len(models))
}

// --- Scraper integration ---

// ScrapeResult holds the data from one scrape cycle.
type ScrapeResult struct {
	Timestamp time.Time
	Models    map[string]ModelInfo // key: "namespace/container"
	Rows      []storage.MetricRow
}

// ModelInfo identifies a model discovered during scrape.
type ModelInfo struct {
	ID        int64
	Namespace string
	Container string
	ModelName string
}

// IngestScrapeResults updates cache with new scrape data, then rebuilds models JSON.
func (c *Cache) IngestScrapeResults(result *ScrapeResult) {
	now := result.Timestamp

	// Update model registry
	c.modelsMu.Lock()
	for _, m := range result.Models {
		if existing, ok := c.models[m.ID]; ok {
			existing.LastSeen = now
			if m.ModelName != "" {
				existing.ModelName = m.ModelName
			}
		} else {
			c.models[m.ID] = &modelEntry{
				ID: m.ID, Namespace: m.Namespace, Container: m.Container,
				ModelName: m.ModelName, FirstSeen: now, LastSeen: now,
			}
			c.modelKey[m.Namespace+"/"+m.Container] = m.ID
		}
	}
	c.modelsMu.Unlock()

	// Append metric points to time series
	c.seriesMu.Lock()
	for _, row := range result.Rows {
		c.ensureSeriesMap(row.ModelID, row.MetricName)
		c.series[row.ModelID][row.MetricName][row.LabelKey] = append(
			c.series[row.ModelID][row.MetricName][row.LabelKey],
			MetricPoint{Timestamp: row.Timestamp, Value: row.Value},
		)
	}
	c.seriesMu.Unlock()

	// Trim old series data (keep 30 days)
	c.trimSeries()

	// Update uptime trackers
	c.uptimeMu.Lock()
	c.advanceUptimeBuckets(now)
	bucketDur := time.Duration(uptimeBucketMins) * time.Minute
	for _, row := range result.Rows {
		if row.MetricName != c.discoveryMetric {
			continue
		}
		tracker, ok := c.uptime[row.ModelID]
		if !ok {
			tracker = &uptimeTracker{baseTime: uptimeBase(now)}
			c.uptime[row.ModelID] = tracker
		}
		bucketStart := row.Timestamp.UTC().Truncate(bucketDur)
		idx := int(bucketStart.Sub(tracker.baseTime) / bucketDur)
		if idx >= 0 && idx < uptimeBuckets {
			tracker.counts[idx]++
		}
	}
	c.uptimeMu.Unlock()

	// Rebuild the models JSON snapshot
	c.RebuildModelsJSON()
}

// uptimeBase returns the aligned base time for uptime tracking.
func uptimeBase(now time.Time) time.Time {
	bucketDur := time.Duration(uptimeBucketMins) * time.Minute
	currentBucketStart := now.UTC().Truncate(bucketDur)
	return currentBucketStart.Add(-time.Duration(uptimeBuckets-1) * bucketDur)
}

// advanceUptimeBuckets rolls forward uptime trackers, zeroing out stale buckets.
func (c *Cache) advanceUptimeBuckets(now time.Time) {
	desiredBase := uptimeBase(now)
	bucketDur := time.Duration(uptimeBucketMins) * time.Minute

	for _, tracker := range c.uptime {
		if !desiredBase.After(tracker.baseTime) {
			continue
		}
		shift := int(desiredBase.Sub(tracker.baseTime) / bucketDur)
		if shift >= uptimeBuckets {
			tracker.counts = [uptimeBuckets]int{}
		} else if shift > 0 {
			var newCounts [uptimeBuckets]int
			copy(newCounts[:], tracker.counts[shift:])
			tracker.counts = newCounts
		}
		tracker.baseTime = desiredBase
	}
}

// trimSeries removes points older than 30 days and downsamples older regions
// to bound memory usage (prevents OOM at 512Mi container limit).
// Downsampling policy: >7d = 30min resolution, 2-7d = 5min resolution, <2d = raw.
func (c *Cache) trimSeries() {
	now := time.Now().UTC()
	cutoff := now.Add(-30 * 24 * time.Hour)
	coarseBoundary := now.Add(-7 * 24 * time.Hour)
	medBoundary := now.Add(-2 * 24 * time.Hour)

	c.seriesMu.Lock()
	defer c.seriesMu.Unlock()

	for _, metrics := range c.series {
		for _, labels := range metrics {
			for label, points := range labels {
				// Remove points older than 30 days
				idx := sort.Search(len(points), func(i int) bool {
					return points[i].Timestamp.After(cutoff)
				})
				if idx > 0 {
					points = points[idx:]
				}

				// Downsample older regions to bound memory
				labels[label] = downsamplePoints(points, coarseBoundary, medBoundary)
			}
		}
	}
}

// downsamplePoints reduces point density in older time regions.
// Before coarseBoundary: keep 1 per 30min.
// coarseBoundary to medBoundary: keep 1 per 5min.
// After medBoundary: keep all (raw).
func downsamplePoints(points []MetricPoint, coarseBoundary, medBoundary time.Time) []MetricPoint {
	if len(points) == 0 || points[0].Timestamp.After(medBoundary) {
		return points // All points in raw zone, nothing to downsample
	}
	result := make([]MetricPoint, 0, len(points)/2+1)
	var lastKept time.Time

	for _, p := range points {
		var minGap time.Duration
		if p.Timestamp.Before(coarseBoundary) {
			minGap = 30 * time.Minute
		} else if p.Timestamp.Before(medBoundary) {
			minGap = 5 * time.Minute
		} else {
			// Raw zone: keep all points
			result = append(result, p)
			continue
		}
		if lastKept.IsZero() || p.Timestamp.Sub(lastKept) >= minGap {
			result = append(result, p)
			lastKept = p.Timestamp
		}
	}
	return result
}

// UpdateHealth updates the cached health JSON.
func (c *Cache) UpdateHealth(scraperHealthy bool, scraperLastOK time.Time, promHealthy bool, promLastSuccess time.Time) {
	resp := map[string]interface{}{
		"prometheus_healthy": promHealthy,
		"scraper_healthy":    scraperHealthy,
	}
	if !promLastSuccess.IsZero() {
		resp["prometheus_last_success"] = promLastSuccess.Format(time.RFC3339)
	}
	if !scraperLastOK.IsZero() {
		resp["scraper_last_success"] = scraperLastOK.Format(time.RFC3339)
	}
	data, _ := json.Marshal(resp)
	c.healthJSON.Store(data)
}

// --- JSON snapshot builders ---

type modelResponse struct {
	ID        int64                  `json:"id"`
	Namespace string                 `json:"namespace"`
	Container string                 `json:"container"`
	ModelName string                 `json:"model_name"`
	Status    string                 `json:"status"`
	FirstSeen string                 `json:"first_seen"`
	LastSeen  string                 `json:"last_seen"`
	Latest    map[string]interface{} `json:"latest,omitempty"`
	Uptime    []bool                 `json:"uptime,omitempty"`
}

// RebuildModelsJSON rebuilds the pre-serialized models list JSON.
func (c *Cache) RebuildModelsJSON() {
	c.modelsMu.RLock()
	c.seriesMu.RLock()
	c.uptimeMu.RLock()
	defer c.modelsMu.RUnlock()
	defer c.seriesMu.RUnlock()
	defer c.uptimeMu.RUnlock()

	now := time.Now().UTC()
	scrapeIntervalSec := int(c.scrapeInterval.Seconds())
	if scrapeIntervalSec <= 0 {
		scrapeIntervalSec = 30
	}
	expectedPoints := float64(uptimeBucketSec) / float64(scrapeIntervalSec)

	resp := make([]modelResponse, 0, len(c.models))
	for _, m := range c.models {
		status := "online"
		if now.Sub(m.LastSeen) > c.cfg.Models.ArchiveThreshold {
			status = "archived"
		} else if now.Sub(m.LastSeen) > c.cfg.Models.DownThreshold {
			status = "down"
		}

		mr := modelResponse{
			ID:        m.ID,
			Namespace: m.Namespace,
			Container: m.Container,
			ModelName: m.ModelName,
			Status:    status,
			FirstSeen: m.FirstSeen.Format(time.RFC3339),
			LastSeen:  m.LastSeen.Format(time.RFC3339),
			Latest:    make(map[string]interface{}),
		}

		// Uptime from tracker
		if tracker, ok := c.uptime[m.ID]; ok {
			buckets := make([]bool, uptimeBuckets)
			bucketDur := time.Duration(uptimeBucketMins) * time.Minute
			for i := 0; i < uptimeBuckets; i++ {
				expect := expectedPoints
				// For the current (last) bucket, scale expected points by elapsed fraction
				if i == uptimeBuckets-1 {
					bucketStart := tracker.baseTime.Add(time.Duration(i) * bucketDur)
					elapsed := now.Sub(bucketStart).Seconds()
					if elapsed < 0 {
						elapsed = 0
					}
					if elapsed < float64(uptimeBucketSec) {
						expect = elapsed / float64(scrapeIntervalSec)
					}
				}
				// Need at least 1 point to count as "up" (avoids 80% of 0 = 0)
				threshold := expect * 0.8
				if threshold < 1 {
					threshold = 1
				}
				buckets[i] = float64(tracker.counts[i]) >= threshold
			}
			mr.Uptime = buckets
		}

		// Latest scalar metrics (last point from series)
		for _, metric := range c.scalarSummary {
			if labels, ok := c.series[m.ID][metric]; ok {
				if points, ok := labels[""]; ok && len(points) > 0 {
					mr.Latest[metric] = points[len(points)-1].Value
				} else if len(labels) > 0 {
					// Has labels but no empty key — return all
					vals := make(map[string]float64)
					for label, pts := range labels {
						if len(pts) > 0 {
							vals[label] = pts[len(pts)-1].Value
						}
					}
					mr.Latest[metric] = vals
				}
			}
		}

		// Latest labeled metrics
		for _, metric := range c.labeledSummary {
			if labels, ok := c.series[m.ID][metric]; ok && len(labels) > 0 {
				vals := make(map[string]float64)
				for label, pts := range labels {
					if len(pts) > 0 {
						vals[label] = pts[len(pts)-1].Value
					}
				}
				mr.Latest[metric] = vals
			}
		}

		resp = append(resp, mr)
	}

	// Sort by model name for stable ordering
	sort.Slice(resp, func(i, j int) bool {
		return resp[i].ModelName < resp[j].ModelName
	})

	data, err := json.Marshal(resp)
	if err != nil {
		log.Printf("[cache] marshal models JSON error: %v", err)
		return
	}
	c.modelsJSON.Store(data)
}

// --- Getters for HTTP handlers ---

// GetModelsJSON returns the pre-serialized models list JSON.
func (c *Cache) GetModelsJSON() []byte {
	v := c.modelsJSON.Load()
	if v == nil {
		return nil
	}
	return v.([]byte)
}

// GetMetricsMetaJSON returns the pre-serialized metrics metadata JSON.
func (c *Cache) GetMetricsMetaJSON() []byte {
	v := c.metricsMetaJSON.Load()
	if v == nil {
		return nil
	}
	return v.([]byte)
}

// GetConfigJSON returns the pre-serialized config JSON.
func (c *Cache) GetConfigJSON() []byte {
	v := c.configJSON.Load()
	if v == nil {
		return nil
	}
	return v.([]byte)
}

// GetHealthJSON returns the pre-serialized health JSON.
func (c *Cache) GetHealthJSON() []byte {
	v := c.healthJSON.Load()
	if v == nil {
		return nil
	}
	return v.([]byte)
}

// maxPointsPerSeries caps the number of points returned per series to bound CPU/memory.
const maxPointsPerSeries = 2000

// GetSeries returns time series data for a model/metric within a time range.
func (c *Cache) GetSeries(modelID int64, metricName string, from, to time.Time) []LabeledSeries {
	c.seriesMu.RLock()
	defer c.seriesMu.RUnlock()

	metrics, ok := c.series[modelID]
	if !ok {
		return []LabeledSeries{}
	}
	labels, ok := metrics[metricName]
	if !ok {
		return []LabeledSeries{}
	}

	// Collect labels sorted for stable order
	labelNames := make([]string, 0, len(labels))
	for label := range labels {
		labelNames = append(labelNames, label)
	}
	sort.Strings(labelNames)

	result := make([]LabeledSeries, 0, len(labelNames))
	for _, label := range labelNames {
		points := labels[label]
		// Binary search for range start
		startIdx := sort.Search(len(points), func(i int) bool {
			return !points[i].Timestamp.Before(from)
		})
		// Binary search for range end
		endIdx := sort.Search(len(points), func(i int) bool {
			return points[i].Timestamp.After(to)
		})

		if startIdx >= endIdx {
			continue
		}

		n := endIdx - startIdx
		var rangePoints []MetricPoint
		if n > maxPointsPerSeries {
			// Downsample: take every stride-th point, always include last
			stride := (n + maxPointsPerSeries - 1) / maxPointsPerSeries
			if stride < 2 {
				stride = 2
			}
			rangePoints = make([]MetricPoint, 0, maxPointsPerSeries+1)
			for i := startIdx; i < endIdx; i += stride {
				rangePoints = append(rangePoints, points[i])
			}
			last := points[endIdx-1]
			if len(rangePoints) == 0 || rangePoints[len(rangePoints)-1].Timestamp != last.Timestamp {
				rangePoints = append(rangePoints, last)
			}
		} else {
			rangePoints = make([]MetricPoint, n)
			copy(rangePoints, points[startIdx:endIdx])
		}

		result = append(result, LabeledSeries{
			Label:  label,
			Points: rangePoints,
		})
	}

	return result
}
