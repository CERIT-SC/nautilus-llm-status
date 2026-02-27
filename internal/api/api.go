package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/nautilus-llm-status/internal/config"
	"github.com/nautilus-llm-status/internal/scraper"
	"github.com/nautilus-llm-status/internal/storage"
)

type Server struct {
	store   *storage.Store
	scraper *scraper.Scraper
	cfg     *config.Config
	mux     *http.ServeMux

	// Derived from config at construction time
	discoveryMetric string   // metric used for uptime detection
	scalarSummary   []string // summary metrics without LabelKey
	labeledSummary  []string // summary metrics with LabelKey
	allSummary      []string // scalarSummary + labeledSummary
}

func New(store *storage.Store, scraper *scraper.Scraper, cfg *config.Config) *Server {
	s := &Server{
		store:   store,
		scraper: scraper,
		cfg:     cfg,
		mux:     http.NewServeMux(),
	}

	// Derive summary metric lists and discovery metric from config rules
	for _, rule := range cfg.Metrics.ScrapeRules {
		if rule.Discovery {
			s.discoveryMetric = rule.StorageName
		}
		if !rule.Summary {
			continue
		}
		if rule.LabelKey != "" {
			s.labeledSummary = append(s.labeledSummary, rule.StorageName)
		} else {
			s.scalarSummary = append(s.scalarSummary, rule.StorageName)
		}
	}
	s.allSummary = append(append([]string{}, s.scalarSummary...), s.labeledSummary...)

	s.routes()
	return s
}

func (s *Server) Handler() http.Handler {
	return s.mux
}

func (s *Server) routes() {
	s.mux.HandleFunc("/api/v1/config", s.handleConfig)
	s.mux.HandleFunc("/api/v1/models", s.handleModels)
	s.mux.HandleFunc("/api/v1/models/", s.handleModelRoute)
	s.mux.HandleFunc("/api/v1/metrics-meta", s.handleMetricsMeta)
	s.mux.HandleFunc("/api/v1/health", s.handleHealth)
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("[api] encode error: %v", err)
	}
}

func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]interface{}{
		"header": s.cfg.UI.Header,
		"logo":   s.cfg.UI.Logo,
	})
}

type metricMeta struct {
	StorageName  string  `json:"storage_name"`
	DisplayName  string  `json:"display_name"`
	Unit         string  `json:"unit,omitempty"`
	DisplayScale float64 `json:"display_scale,omitempty"`
	HasLabels    bool    `json:"has_labels"`
	Summary      bool    `json:"summary"`
}

func (s *Server) handleMetricsMeta(w http.ResponseWriter, r *http.Request) {
	var metrics []metricMeta
	for _, rule := range s.cfg.Metrics.ScrapeRules {
		metrics = append(metrics, metricMeta{
			StorageName:  rule.StorageName,
			DisplayName:  rule.DisplayName,
			Unit:         rule.Unit,
			DisplayScale: rule.DisplayScale,
			HasLabels:    rule.LabelKey != "",
			Summary:      rule.Summary,
		})
	}
	writeJSON(w, metrics)
}

type modelResponse struct {
	ID        int64  `json:"id"`
	Namespace string `json:"namespace"`
	Container string `json:"container"`
	ModelName string `json:"model_name"`
	Status    string `json:"status"` // "online", "down", "archived"
	FirstSeen string `json:"first_seen"`
	LastSeen  string `json:"last_seen"`
	// Latest values for quick display
	Latest map[string]interface{} `json:"latest,omitempty"`
	// 24h uptime: 48 x 30-min buckets, oldest first
	Uptime []bool `json:"uptime,omitempty"`
}

func (s *Server) handleModels(w http.ResponseWriter, r *http.Request) {
	models, err := s.store.GetModels()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Single batch query for all latest metrics across all models
	latestAll, err := s.store.GetAllLatestMetrics(s.allSummary)
	if err != nil {
		log.Printf("[api] batch latest metrics error: %v", err)
		// Continue without latest data rather than failing
		latestAll = nil
	}

	// 24h uptime buckets (48 x 30min), using scrape interval for coverage threshold
	scrapeIntervalSec := int(s.cfg.Prometheus.ScrapeInterval.Seconds())
	uptimeAll, err := s.store.GetUptimeBuckets(s.discoveryMetric, 24, 30, scrapeIntervalSec)
	if err != nil {
		log.Printf("[api] uptime buckets error: %v", err)
	}

	now := time.Now().UTC()
	var resp []modelResponse

	for _, m := range models {
		status := "online"
		if now.Sub(m.LastSeen) > s.cfg.Models.ArchiveThreshold {
			status = "archived"
		} else if now.Sub(m.LastSeen) > s.cfg.Models.DownThreshold {
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

		if buckets, ok := uptimeAll[m.ID]; ok {
			mr.Uptime = buckets
		}

		if latestAll != nil {
			modelMetrics := latestAll[m.ID]
			for _, metric := range s.scalarSummary {
				if vals, ok := modelMetrics[metric]; ok && len(vals) > 0 {
					if v, exists := vals[""]; exists {
						mr.Latest[metric] = v
					} else {
						mr.Latest[metric] = vals
					}
				}
			}
			for _, metric := range s.labeledSummary {
				if vals, ok := modelMetrics[metric]; ok && len(vals) > 0 {
					mr.Latest[metric] = vals
				}
			}
		}

		resp = append(resp, mr)
	}

	writeJSON(w, resp)
}

// handleModelRoute routes /api/v1/models/{id}/metrics/{name}
func (s *Server) handleModelRoute(w http.ResponseWriter, r *http.Request) {
	// Parse path: /api/v1/models/{id}/metrics/{name}
	path := r.URL.Path
	// Remove prefix
	const prefix = "/api/v1/models/"
	if len(path) <= len(prefix) {
		http.NotFound(w, r)
		return
	}
	rest := strings.Trim(path[len(prefix):], "/")
	parts := strings.Split(rest, "/")

	// Expect: {id} "metrics" {name}
	if len(parts) != 3 || parts[1] != "metrics" {
		http.NotFound(w, r)
		return
	}

	modelID, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		http.Error(w, "invalid model ID", http.StatusBadRequest)
		return
	}
	metricName := parts[2]

	s.handleMetrics(w, r, modelID, metricName)
}

func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request, modelID int64, metricName string) {
	// Parse time range from query params
	fromStr := r.URL.Query().Get("from")
	toStr := r.URL.Query().Get("to")

	var from, to time.Time
	if fromStr != "" {
		from, _ = time.Parse(time.RFC3339, fromStr)
	}
	if toStr != "" {
		to, _ = time.Parse(time.RFC3339, toStr)
	}

	if from.IsZero() {
		from = time.Now().UTC().Add(-24 * time.Hour)
	}
	if to.IsZero() {
		to = time.Now().UTC()
	}

	series, err := s.store.GetMetrics(modelID, metricName, from, to)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, series)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	healthy, lastSuccess, err := s.store.GetLatestPrometheusHealth()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	scraperHealthy := s.scraper.IsHealthy()
	scraperLastOK := s.scraper.LastSuccess()

	resp := map[string]interface{}{
		"prometheus_healthy": healthy,
		"scraper_healthy":    scraperHealthy,
	}
	if !lastSuccess.IsZero() {
		resp["prometheus_last_success"] = lastSuccess.Format(time.RFC3339)
	}
	if !scraperLastOK.IsZero() {
		resp["scraper_last_success"] = scraperLastOK.Format(time.RFC3339)
	}
	writeJSON(w, resp)
}
