package config

import (
	"os"
	"strconv"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Prometheus PrometheusConfig `yaml:"prometheus"`
	Storage    StorageConfig    `yaml:"storage"`
	Metrics    MetricsConfig    `yaml:"metrics"`
	Compaction CompactionConfig `yaml:"compaction"`
	UI         UIConfig         `yaml:"ui"`
	Models     ModelsConfig     `yaml:"models"`
}

type PrometheusConfig struct {
	URL            string        `yaml:"url"`
	ScrapeInterval time.Duration `yaml:"scrape_interval"`
	QueryTimeout   time.Duration `yaml:"query_timeout"`
}

type StorageConfig struct {
	Path string `yaml:"path"`
}

type MetricsConfig struct {
	NumRequestsRunning  string `yaml:"num_requests_running"`
	NumRequestsWaiting  string `yaml:"num_requests_waiting"`
	KVCacheUsagePerc    string `yaml:"kv_cache_usage_perc"`
	E2ELatencyHistogram string `yaml:"e2e_latency_histogram"`
	GenerationTokens    string `yaml:"generation_tokens_total"`
	GPUUtilization      string `yaml:"gpu_utilization"`
}

type CompactionConfig struct {
	RawRetention      time.Duration `yaml:"raw_retention"`
	MediumRetention   time.Duration `yaml:"medium_retention"`
	MediumResolution  time.Duration `yaml:"medium_resolution"`
	CoarseRetention   time.Duration `yaml:"coarse_retention"`
	CoarseResolution  time.Duration `yaml:"coarse_resolution"`
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
			NumRequestsRunning:  "vllm:num_requests_running",
			NumRequestsWaiting:  "vllm:num_requests_waiting",
			KVCacheUsagePerc:    "vllm:kv_cache_usage_perc",
			E2ELatencyHistogram: "vllm:e2e_request_latency_seconds_bucket",
			GenerationTokens:    "vllm:generation_tokens_total",
			GPUUtilization:      "DCGM_FI_DEV_GPU_UTIL",
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

	// Override with env var
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

	return cfg, nil
}
