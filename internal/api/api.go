package api

import (
	"crypto/subtle"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/nautilus-llm-status/internal/cache"
	"github.com/nautilus-llm-status/internal/config"
	"github.com/nautilus-llm-status/internal/storage"
)

type Server struct {
	store    *storage.Store
	cache    *cache.Cache
	cfg      *config.Config
	mux      *http.ServeMux
	backupMu sync.Mutex
}

func New(store *storage.Store, c *cache.Cache, cfg *config.Config) *Server {
	s := &Server{
		store: store,
		cache: c,
		cfg:   cfg,
		mux:   http.NewServeMux(),
	}
	s.routes()
	return s
}

func (s *Server) Handler() http.Handler {
	return s.mux
}

func (s *Server) routes() {
	s.mux.HandleFunc("/status/api/v1/config", s.handleConfig)
	s.mux.HandleFunc("/status/api/v1/models", s.handleModels)
	s.mux.HandleFunc("/status/api/v1/models/", s.handleModelRoute)
	s.mux.HandleFunc("/status/api/v1/metrics-meta", s.handleMetricsMeta)
	s.mux.HandleFunc("/status/api/v1/health", s.handleHealth)
	s.mux.HandleFunc("/status/api/v1/ready", s.handleReady)
	s.mux.HandleFunc("/status/api/v1/backup", s.handleBackup)
}

func serveJSON(w http.ResponseWriter, data []byte) {
	if data == nil {
		http.Error(w, "not ready", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

// handleConfig serves pre-computed config JSON from cache.
func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	serveJSON(w, s.cache.GetConfigJSON())
}

// handleMetricsMeta serves pre-computed metrics metadata JSON from cache.
func (s *Server) handleMetricsMeta(w http.ResponseWriter, r *http.Request) {
	serveJSON(w, s.cache.GetMetricsMetaJSON())
}

// handleModels serves pre-computed models list JSON from cache.
// This is the hot path — must be zero-SQL, zero-allocation.
func (s *Server) handleModels(w http.ResponseWriter, r *http.Request) {
	serveJSON(w, s.cache.GetModelsJSON())
}

// handleHealth serves pre-computed health JSON from cache.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	serveJSON(w, s.cache.GetHealthJSON())
}

// handleReady reports readiness for the Kubernetes readiness probe.
// Returns 503 until the startup gap-fill has completed.
func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	ready := s.cache.IsReady()
	status := http.StatusOK
	if !ready {
		status = http.StatusServiceUnavailable
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]bool{"ready": ready})
}

// handleModelRoute routes /status/api/v1/models/{id}/metrics/{name}
func (s *Server) handleModelRoute(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	const prefix = "/status/api/v1/models/"
	if len(path) <= len(prefix) {
		http.NotFound(w, r)
		return
	}
	rest := strings.Trim(path[len(prefix):], "/")
	parts := strings.Split(rest, "/")

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

// handleMetrics serves time series data from cache.
// Supports ?range=3h|24h|7d|30d (preferred) or legacy ?from=&to= parameters.
func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request, modelID int64, metricName string) {
	var from, to time.Time
	now := time.Now().UTC()

	// Prefer discrete range parameter (cacheable URLs)
	allowedRanges := map[string]time.Duration{
		"3h": 3 * time.Hour, "24h": 24 * time.Hour,
		"7d": 7 * 24 * time.Hour, "30d": 30 * 24 * time.Hour,
	}
	if rangeStr := r.URL.Query().Get("range"); rangeStr != "" {
		d, ok := allowedRanges[rangeStr]
		if !ok {
			http.Error(w, "invalid range", http.StatusBadRequest)
			return
		}
		from = now.Add(-d)
		to = now
	} else {
		// Legacy from/to parameters
		fromStr := r.URL.Query().Get("from")
		toStr := r.URL.Query().Get("to")
		if fromStr != "" {
			from, _ = time.Parse(time.RFC3339, fromStr)
		}
		if toStr != "" {
			to, _ = time.Parse(time.RFC3339, toStr)
		}
		if from.IsZero() {
			from = now.Add(-24 * time.Hour)
		}
		if to.IsZero() {
			to = now
		}
	}

	series := s.cache.GetSeries(modelID, metricName, from, to)
	if series == nil {
		series = []cache.LabeledSeries{}
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(series); err != nil {
		log.Printf("[api] encode error: %v", err)
	}
}

// handleBackup serves a consistent SQLite snapshot.
// Requires BACKUP_TOKEN to be configured; disabled otherwise.
func (s *Server) handleBackup(w http.ResponseWriter, r *http.Request) {
	if s.cfg.BackupToken == "" {
		http.NotFound(w, r)
		return
	}

	tok := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if len(tok) != len(s.cfg.BackupToken) || subtle.ConstantTimeCompare([]byte(tok), []byte(s.cfg.BackupToken)) != 1 {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	s.backupMu.Lock()
	defer s.backupMu.Unlock()

	// Write backup to the data volume (not /tmp which is memory-backed and size-limited).
	dataDir := filepath.Dir(s.cfg.Storage.Path)
	tmpFile, err := os.CreateTemp(dataDir, "nautilus-backup-*.db")
	if err != nil {
		log.Printf("[api] create temp file error: %v", err)
		http.Error(w, "backup failed", http.StatusInternalServerError)
		return
	}
	tmpPath := tmpFile.Name()
	tmpFile.Close()
	defer os.Remove(tmpPath)

	log.Println("[api] creating backup snapshot...")
	if err := s.store.BackupTo(tmpPath); err != nil {
		log.Printf("[api] backup error: %v", err)
		http.Error(w, "backup failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", "attachment; filename=nautilus-status.db")
	http.ServeFile(w, r, tmpPath)
}
