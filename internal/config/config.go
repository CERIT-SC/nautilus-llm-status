package config

import (
	"os"
	"strconv"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Prometheus  PrometheusConfig `yaml:"prometheus"`
	Storage     StorageConfig    `yaml:"storage"`
	Metrics     MetricsConfig    `yaml:"metrics"`
	Compaction  CompactionConfig `yaml:"compaction"`
	UI          UIConfig         `yaml:"ui"`
	Models      ModelsConfig     `yaml:"models"`
	BackupToken string           `yaml:"backup_token"`
}

type PrometheusConfig struct {
	URL            string        `yaml:"url"`
	ScrapeInterval time.Duration `yaml:"scrape_interval"`
	QueryTimeout   time.Duration `yaml:"query_timeout"`
}

type StorageConfig struct {
	Path string `yaml:"path"`
}

// ScrapeRule defines how to collect a single metric from Prometheus.
type ScrapeRule struct {
	// StorageName is the name stored in SQLite (e.g. "num_requests_running")
	StorageName string `yaml:"storage_name"`

	// Query is the PromQL template. Use {metric} as placeholder for the Prometheus metric name.
	// Examples:
	//   "sum({metric}) by (namespace, container)"
	//   "avg({metric}) by (namespace, container)"
	//   "sum(rate({metric}[5m])) by (namespace, container)"
	//   "histogram_quantile(0.5, sum(rate({metric}[5m])) by (le, namespace, container))"
	Query string `yaml:"query"`

	// LabelKey is the Prometheus label to extract as the series label in storage.
	// Empty means single series per model. E.g. "modelName" for GPU type breakdown.
	LabelKey string `yaml:"label_key,omitempty"`

	// Discovery marks this rule as the one used to discover models.
	// The query MUST include model_name in the by clause.
	Discovery bool `yaml:"discovery,omitempty"`

	// Summary marks this metric for display on the home page model cards.
	Summary bool `yaml:"summary,omitempty"`

	// DisplayScale multiplies values before display (e.g. 100 for 0-1 → percentage).
	DisplayScale float64 `yaml:"display_scale,omitempty"`

	// Unit for display (e.g. "%", "s", "tok/s")
	Unit string `yaml:"unit,omitempty"`

	// DisplayName for chart titles
	DisplayName string `yaml:"display_name,omitempty"`

	// SkipNaN filters out NaN/Inf values (useful for histogram_quantile)
	SkipNaN bool `yaml:"skip_nan,omitempty"`
}

type MetricsConfig struct {
	ScrapeRules []ScrapeRule `yaml:"scrape_rules"`
}

type CompactionConfig struct {
	RawRetention     time.Duration `yaml:"raw_retention"`
	MediumRetention  time.Duration `yaml:"medium_retention"`
	MediumResolution time.Duration `yaml:"medium_resolution"`
	CoarseRetention  time.Duration `yaml:"coarse_retention"`
	CoarseResolution time.Duration `yaml:"coarse_resolution"`
}

type UIConfig struct {
	Header string `yaml:"header"`
	Logo   string `yaml:"logo"`
	Port   int    `yaml:"port"`
}

type ModelsConfig struct {
	DownThreshold    time.Duration `yaml:"down_threshold"`
	ArchiveThreshold time.Duration `yaml:"archive_threshold"`
}

func DefaultScrapeRules() []ScrapeRule {
	return []ScrapeRule{
		{
			StorageName: "num_requests_running",
			Query:       "sum(vllm:num_requests_running) by (namespace, container, model_name)",
			Discovery:   true,
			Summary:     true,
			DisplayName: "Running Requests",
		},
		{
			StorageName: "num_requests_waiting",
			Query:       "sum(vllm:num_requests_waiting) by (namespace, container)",
			Summary:     true,
			DisplayName: "Waiting Requests",
		},
		{
			StorageName:  "kv_cache_usage_perc",
			Query:        "avg(vllm:kv_cache_usage_perc) by (namespace, container)",
			Summary:      true,
			DisplayScale: 100,
			Unit:         "%",
			DisplayName:  "KV Cache Usage",
		},
		{
			StorageName: "generation_tokens_rate",
			Query:       "sum(rate(vllm:generation_tokens_total[5m])) by (namespace, container)",
			Summary:     true,
			Unit:        "tok/s",
			DisplayName: "Token Generation Rate",
		},
		{
			StorageName: "gpu_count",
			Query:       "count(DCGM_FI_DEV_GPU_UTIL) by (namespace, container, modelName)",
			LabelKey:    "modelName",
			Summary:     true,
			DisplayName: "GPU Count by Type",
		},
		{
			StorageName: "gpu_utilization",
			Query:       "avg(DCGM_FI_DEV_GPU_UTIL) by (namespace, container, modelName)",
			LabelKey:    "modelName",
			Unit:        "%",
			DisplayName: "GPU Utilization",
		},
		{
			StorageName: "latency_p50",
			Query:       "histogram_quantile(0.5, sum(rate(vllm:e2e_request_latency_seconds_bucket[5m])) by (le, namespace, container))",
			SkipNaN:     true,
			Unit:        "s",
			DisplayName: "Latency P50",
		},
		{
			StorageName: "latency_p99",
			Query:       "histogram_quantile(0.99, sum(rate(vllm:e2e_request_latency_seconds_bucket[5m])) by (le, namespace, container))",
			SkipNaN:     true,
			Unit:        "s",
			DisplayName: "Latency P99",
		},
	}
}

func DefaultConfig() *Config {
	return &Config{
		Prometheus: PrometheusConfig{
			URL:            "https://prometheus.nrp-nautilus.io",
			ScrapeInterval: 30 * time.Second,
			QueryTimeout:   10 * time.Second,
		},
		Storage: StorageConfig{
			Path: "/data/nautilus-status.db",
		},
		Metrics: MetricsConfig{
			ScrapeRules: DefaultScrapeRules(),
		},
		Compaction: CompactionConfig{
			RawRetention:     7 * 24 * time.Hour,
			MediumRetention:  30 * 24 * time.Hour,
			MediumResolution: 5 * time.Minute,
			CoarseRetention:  365 * 24 * time.Hour,
			CoarseResolution: time.Hour,
		},
		UI: UIConfig{
			Header: "Nautilus LLM Status",
			Port:   8080,
		},
		Models: ModelsConfig{
			DownThreshold:    5 * time.Minute,
			ArchiveThreshold: 7 * 24 * time.Hour,
		},
	}
}

func Load(path string) (*Config, error) {
	cfg := DefaultConfig()

	if v := os.Getenv("PROMETHEUS_URL"); v != "" {
		cfg.Prometheus.URL = v
	}
	if v := os.Getenv("DB_PATH"); v != "" {
		cfg.Storage.Path = v
	}
	if v := os.Getenv("PORT"); v != "" {
		if p, err := strconv.Atoi(v); err == nil {
			cfg.UI.Port = p
		}
	}
	if v := os.Getenv("BACKUP_TOKEN"); v != "" {
		cfg.BackupToken = v
	}

	if path == "" {
		return cfg, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return nil, err
	}

	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}

	// Env vars take precedence over config file
	if v := os.Getenv("PROMETHEUS_URL"); v != "" {
		cfg.Prometheus.URL = v
	}
	if v := os.Getenv("DB_PATH"); v != "" {
		cfg.Storage.Path = v
	}
	if v := os.Getenv("PORT"); v != "" {
		if p, err := strconv.Atoi(v); err == nil {
			cfg.UI.Port = p
		}
	}
	if v := os.Getenv("BACKUP_TOKEN"); v != "" {
		cfg.BackupToken = v
	}

	return cfg, nil
}
