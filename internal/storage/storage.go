package storage

import (
	"database/sql"
	"fmt"
	"os"
	"sort"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type Store struct {
	db *sql.DB
}

type Model struct {
	ID        int64     `json:"id"`
	Namespace string    `json:"namespace"`
	Container string    `json:"container"`
	ModelName string    `json:"model_name"`
	FirstSeen time.Time `json:"first_seen"`
	LastSeen  time.Time `json:"last_seen"`
}

type MetricPoint struct {
	Timestamp time.Time `json:"timestamp"`
	Value     float64   `json:"value"`
}

type LabeledSeries struct {
	Label  string        `json:"label"`
	Points []MetricPoint `json:"points"`
}

func New(path string) (*Store, error) {
	db, err := sql.Open("sqlite3", path+"?_journal_mode=WAL&_busy_timeout=30000&_synchronous=NORMAL")
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}

	// Pool of 4: allows concurrent reads + 1 writer without starving
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(4)

	// Enable incremental auto-vacuum so space is reclaimed gradually
	db.Exec("PRAGMA auto_vacuum = INCREMENTAL")

	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

// BackupTo creates a consistent snapshot of the database at dstPath.
// Uses VACUUM INTO which is safe to call while the DB is being written to.
func (s *Store) BackupTo(dstPath string) error {
	os.Remove(dstPath) // ensure clean target
	_, err := s.db.Exec("VACUUM INTO ?", dstPath)
	return err
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS models (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			namespace TEXT NOT NULL,
			container TEXT NOT NULL,
			model_name TEXT NOT NULL,
			first_seen DATETIME NOT NULL,
			last_seen DATETIME NOT NULL,
			UNIQUE(namespace, container)
		);

		CREATE TABLE IF NOT EXISTS metrics (
			model_id INTEGER NOT NULL REFERENCES models(id),
			metric_name TEXT NOT NULL,
			label_key TEXT NOT NULL DEFAULT '',
			timestamp DATETIME NOT NULL,
			value REAL NOT NULL,
			UNIQUE(model_id, metric_name, label_key, timestamp)
		);

		CREATE INDEX IF NOT EXISTS idx_metrics_lookup
			ON metrics(model_id, metric_name, timestamp);
		CREATE INDEX IF NOT EXISTS idx_metrics_compaction
			ON metrics(timestamp);
		CREATE INDEX IF NOT EXISTS idx_metrics_name_ts
			ON metrics(metric_name, timestamp);

		CREATE TABLE IF NOT EXISTS prometheus_health (
			timestamp DATETIME NOT NULL,
			healthy BOOLEAN NOT NULL,
			latency_ms INTEGER,
			error_message TEXT
		);

		CREATE INDEX IF NOT EXISTS idx_prom_health_ts
			ON prometheus_health(timestamp);
	`)
	if err != nil {
		return err
	}

	// Migrate legacy latency_seconds (label_key=p50/p99) to latency_p50/latency_p99
	s.db.Exec(`UPDATE metrics SET metric_name='latency_p50', label_key='' WHERE metric_name='latency_seconds' AND label_key='p50'`)
	s.db.Exec(`UPDATE metrics SET metric_name='latency_p99', label_key='' WHERE metric_name='latency_seconds' AND label_key='p99'`)

	return nil
}

func (s *Store) UpsertModel(namespace, container, modelName string, ts time.Time) (int64, error) {
	res, err := s.db.Exec(`
		INSERT INTO models (namespace, container, model_name, first_seen, last_seen)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(namespace, container) DO UPDATE SET
			model_name = excluded.model_name,
			first_seen = MIN(models.first_seen, excluded.first_seen),
			last_seen = MAX(models.last_seen, excluded.last_seen)
	`, namespace, container, modelName, ts, ts)
	if err != nil {
		return 0, err
	}

	// Get the ID (either newly inserted or existing)
	var id int64
	err = s.db.QueryRow("SELECT id FROM models WHERE namespace = ? AND container = ?", namespace, container).Scan(&id)
	if err != nil {
		return 0, err
	}
	_ = res
	return id, nil
}

func (s *Store) InsertMetric(modelID int64, metricName, labelKey string, ts time.Time, value float64) error {
	_, err := s.db.Exec(`
		INSERT OR REPLACE INTO metrics (model_id, metric_name, label_key, timestamp, value)
		VALUES (?, ?, ?, ?, ?)
	`, modelID, metricName, labelKey, ts, value)
	return err
}

func (s *Store) InsertMetricBatch(rows []MetricRow) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT OR REPLACE INTO metrics (model_id, metric_name, label_key, timestamp, value)
		VALUES (?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, r := range rows {
		if _, err := stmt.Exec(r.ModelID, r.MetricName, r.LabelKey, r.Timestamp, r.Value); err != nil {
			return err
		}
	}
	return tx.Commit()
}

type MetricRow struct {
	ModelID    int64
	MetricName string
	LabelKey   string
	Timestamp  time.Time
	Value      float64
}

func (s *Store) GetModels() ([]Model, error) {
	rows, err := s.db.Query("SELECT id, namespace, container, model_name, first_seen, last_seen FROM models ORDER BY model_name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var models []Model
	for rows.Next() {
		var m Model
		if err := rows.Scan(&m.ID, &m.Namespace, &m.Container, &m.ModelName, &m.FirstSeen, &m.LastSeen); err != nil {
			return nil, err
		}
		models = append(models, m)
	}
	return models, nil
}

func (s *Store) GetMetrics(modelID int64, metricName string, from, to time.Time) ([]LabeledSeries, error) {
	rows, err := s.db.Query(`
		SELECT label_key, timestamp, value FROM metrics
		WHERE model_id = ? AND metric_name = ? AND timestamp >= ? AND timestamp <= ?
		ORDER BY label_key, timestamp
	`, modelID, metricName, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	seriesMap := make(map[string][]MetricPoint)
	for rows.Next() {
		var label string
		var ts time.Time
		var val float64
		if err := rows.Scan(&label, &ts, &val); err != nil {
			return nil, err
		}
		seriesMap[label] = append(seriesMap[label], MetricPoint{Timestamp: ts, Value: val})
	}

	// Sort labels for stable series order (prevents chart flicker)
	labels := make([]string, 0, len(seriesMap))
	for label := range seriesMap {
		labels = append(labels, label)
	}
	sort.Strings(labels)

	result := make([]LabeledSeries, 0, len(labels))
	for _, label := range labels {
		result = append(result, LabeledSeries{Label: label, Points: seriesMap[label]})
	}
	return result, nil
}

// GetAllLatestMetrics fetches latest values for all models and specified metrics in one query.
// Scans only the last hour of data to avoid full-table scans during heavy backfill writes.
func (s *Store) GetAllLatestMetrics(metricNames []string) (map[int64]map[string]map[string]float64, error) {
	if len(metricNames) == 0 {
		return nil, nil
	}

	// Build IN clause
	placeholders := ""
	args := make([]interface{}, 0, len(metricNames)+1)
	for i, name := range metricNames {
		if i > 0 {
			placeholders += ","
		}
		placeholders += "?"
		args = append(args, name)
	}
	// Only scan recent data — latest values come from the most recent scrape
	cutoff := time.Now().UTC().Add(-time.Hour)
	args = append(args, cutoff)

	rows, err := s.db.Query(`
		SELECT m.model_id, m.metric_name, m.label_key, m.value
		FROM metrics m
		INNER JOIN (
			SELECT model_id, metric_name, label_key, MAX(timestamp) as max_ts
			FROM metrics
			WHERE metric_name IN (`+placeholders+`) AND timestamp >= ?
			GROUP BY model_id, metric_name, label_key
		) latest ON m.model_id = latest.model_id
			AND m.metric_name = latest.metric_name
			AND m.label_key = latest.label_key
			AND m.timestamp = latest.max_ts
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// result[modelID][metricName][labelKey] = value
	result := make(map[int64]map[string]map[string]float64)
	for rows.Next() {
		var modelID int64
		var metricName, labelKey string
		var val float64
		if err := rows.Scan(&modelID, &metricName, &labelKey, &val); err != nil {
			return nil, err
		}
		if result[modelID] == nil {
			result[modelID] = make(map[string]map[string]float64)
		}
		if result[modelID][metricName] == nil {
			result[modelID][metricName] = make(map[string]float64)
		}
		result[modelID][metricName][labelKey] = val
	}
	return result, nil
}

func (s *Store) GetLatestMetric(modelID int64, metricName string) (map[string]float64, error) {
	rows, err := s.db.Query(`
		SELECT m1.label_key, m1.value FROM metrics m1
		INNER JOIN (
			SELECT label_key, MAX(timestamp) as max_ts
			FROM metrics WHERE model_id = ? AND metric_name = ?
			GROUP BY label_key
		) m2 ON m1.label_key = m2.label_key AND m1.timestamp = m2.max_ts
		WHERE m1.model_id = ? AND m1.metric_name = ?
	`, modelID, metricName, modelID, metricName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]float64)
	for rows.Next() {
		var label string
		var val float64
		if err := rows.Scan(&label, &val); err != nil {
			return nil, err
		}
		result[label] = val
	}
	return result, nil
}

func (s *Store) GetOldestMetricTimestamp(metricName string) (time.Time, error) {
	var ts sql.NullString
	err := s.db.QueryRow("SELECT MIN(timestamp) FROM metrics WHERE metric_name = ?", metricName).Scan(&ts)
	if err != nil {
		return time.Time{}, err
	}
	if !ts.Valid || ts.String == "" {
		return time.Time{}, nil
	}
	for _, layout := range []string{
		"2006-01-02 15:04:05.999999999+00:00",
		"2006-01-02 15:04:05+00:00",
		"2006-01-02T15:04:05Z",
		time.RFC3339Nano,
		time.RFC3339,
	} {
		if t, err := time.Parse(layout, ts.String); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("cannot parse timestamp: %q", ts.String)
}

func (s *Store) GetNewestMetricTimestamp(metricName string) (time.Time, error) {
	var ts sql.NullString
	err := s.db.QueryRow("SELECT MAX(timestamp) FROM metrics WHERE metric_name = ?", metricName).Scan(&ts)
	if err != nil {
		return time.Time{}, err
	}
	if !ts.Valid || ts.String == "" {
		return time.Time{}, nil
	}
	// SQLite stores Go time.Time as "2006-01-02 15:04:05.999999999+00:00"
	for _, layout := range []string{
		"2006-01-02 15:04:05.999999999+00:00",
		"2006-01-02 15:04:05+00:00",
		"2006-01-02T15:04:05Z",
		time.RFC3339Nano,
		time.RFC3339,
	} {
		if t, err := time.Parse(layout, ts.String); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("cannot parse timestamp: %q", ts.String)
}

func (s *Store) RecordPrometheusHealth(healthy bool, latencyMs int, errMsg string) error {
	_, err := s.db.Exec(`
		INSERT INTO prometheus_health (timestamp, healthy, latency_ms, error_message)
		VALUES (?, ?, ?, ?)
	`, time.Now().UTC(), healthy, latencyMs, errMsg)
	return err
}

func (s *Store) GetLatestPrometheusHealth() (healthy bool, lastSuccess time.Time, err error) {
	err = s.db.QueryRow(`
		SELECT healthy, timestamp FROM prometheus_health ORDER BY timestamp DESC LIMIT 1
	`).Scan(&healthy, &lastSuccess)
	if err == sql.ErrNoRows {
		return false, time.Time{}, nil
	}
	return
}

func (s *Store) Compact(rawRetention, mediumRetention, mediumRes, coarseRetention, coarseRes time.Duration) error {
	now := time.Now().UTC()

	// Medium compaction: raw_retention < age < medium_retention → aggregate to mediumRes
	mediumCutoff := now.Add(-rawRetention)
	coarseCutoff := now.Add(-mediumRetention)
	deleteCutoff := now.Add(-coarseRetention)

	for _, c := range []struct {
		olderThan time.Time
		newerThan time.Time
		resolution time.Duration
	}{
		{mediumCutoff, coarseCutoff, mediumRes},
		{coarseCutoff, deleteCutoff, coarseRes},
	} {
		// Use window function to keep exactly 1 row per (series, time-bucket).
		// ROW_NUMBER partitions by series+bucket; we delete all but rn=1.
		_, err := s.db.Exec(`
			DELETE FROM metrics WHERE rowid IN (
				SELECT rid FROM (
					SELECT rowid AS rid,
						ROW_NUMBER() OVER (
							PARTITION BY model_id, metric_name, label_key,
								CAST(strftime('%%s', timestamp) AS INTEGER) / ?
							ORDER BY timestamp
						) AS rn
					FROM metrics
					WHERE timestamp < ? AND timestamp >= ?
				) WHERE rn > 1
			)
		`, int(c.resolution.Seconds()), c.olderThan, c.newerThan)
		if err != nil {
			return fmt.Errorf("compact: %w", err)
		}
	}

	// Delete very old data
	if _, err := s.db.Exec("DELETE FROM metrics WHERE timestamp < ?", deleteCutoff); err != nil {
		return err
	}

	// Prune prometheus_health: keep only 90 days
	healthCutoff := now.Add(-90 * 24 * time.Hour)
	if _, err := s.db.Exec("DELETE FROM prometheus_health WHERE timestamp < ?", healthCutoff); err != nil {
		return fmt.Errorf("prune prometheus_health: %w", err)
	}

	return nil
}

func (s *Store) Vacuum() error {
	_, err := s.db.Exec("VACUUM")
	return err
}

// GetUptimeBuckets returns per-model uptime as boolean arrays.
// Each bucket covers bucketMinutes minutes over the last hours.
// A bucket is "up" only if it has >= 80% of the expected data points
// (expected = bucketMinutes * 60 / scrapeIntervalSec).
func (s *Store) GetUptimeBuckets(metricName string, hours, bucketMinutes, scrapeIntervalSec int) (map[int64][]bool, error) {
	now := time.Now().UTC()
	since := now.Add(-time.Duration(hours) * time.Hour)
	bucketSec := bucketMinutes * 60
	totalBuckets := (hours * 60) / bucketMinutes
	expectedPoints := float64(bucketSec / scrapeIntervalSec)

	rows, err := s.db.Query(`
		SELECT model_id,
			CAST((strftime('%s', timestamp) - strftime('%s', ?)) AS INTEGER) / ? AS bucket,
			COUNT(*) AS cnt
		FROM metrics
		WHERE metric_name = ? AND timestamp >= ?
		GROUP BY model_id, bucket
	`, since, bucketSec, metricName, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[int64][]bool)
	for rows.Next() {
		var modelID int64
		var bucket, cnt int
		if err := rows.Scan(&modelID, &bucket, &cnt); err != nil {
			return nil, err
		}
		if result[modelID] == nil {
			result[modelID] = make([]bool, totalBuckets)
		}
		if bucket >= 0 && bucket < totalBuckets {
			result[modelID][bucket] = float64(cnt) >= expectedPoints*0.8
		}
	}
	return result, nil
}
