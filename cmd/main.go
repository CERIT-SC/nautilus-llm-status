package main

import (
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/nautilus-llm-status/internal/api"
	"github.com/nautilus-llm-status/internal/cache"
	"github.com/nautilus-llm-status/internal/config"
	"github.com/nautilus-llm-status/internal/scraper"
	"github.com/nautilus-llm-status/internal/storage"
	static "github.com/nautilus-llm-status/web"
)

func main() {
	configPath := ""
	if len(os.Args) > 1 {
		configPath = os.Args[1]
	}

	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	store, err := storage.New(cfg.Storage.Path)
	if err != nil {
		log.Fatalf("open storage: %v", err)
	}
	defer store.Close()

	// Initialize in-memory cache and hydrate from SQLite
	c := cache.New(cfg)
	log.Println("Hydrating cache from SQLite...")
	if err := c.HydrateFromStore(store); err != nil {
		log.Printf("WARNING: cache hydration error: %v (starting with empty cache)", err)
	}

	prom := scraper.NewPromClient(cfg.Prometheus.URL, cfg.Prometheus.QueryTimeout)
	sc := scraper.New(prom, store, c, cfg)

	done := make(chan struct{})
	scraperDone := make(chan struct{})
	go func() {
		sc.Run(done)
		close(scraperDone)
	}()

	apiServer := api.New(store, c, cfg)

	mux := http.NewServeMux()

	// API routes
	mux.Handle("/api/", apiServer.Handler())

	// Static files (Vue SPA)
	staticFS, err := fs.Sub(static.FileSystem, static.RootPath)
	if err != nil {
		log.Fatalf("static fs: %v", err)
	}
	fileServer := http.FileServer(http.FS(staticFS))

	// SPA fallback: serve index.html for any non-API, non-file route
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// Static asset cache headers (Vue build uses content hashes)
		if strings.HasPrefix(path, "/js/") || strings.HasPrefix(path, "/css/") || strings.HasPrefix(path, "/img/") {
			w.Header().Set("Cache-Control", "public, max-age=3600")
		}

		if path == "/" {
			path = "/index.html"
		}

		f, err := staticFS.Open(path[1:])
		if err == nil {
			f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}

		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	})

	addr := fmt.Sprintf(":%d", cfg.UI.Port)
	log.Printf("Starting server on %s", addr)
	log.Printf("Prometheus: %s", cfg.Prometheus.URL)
	log.Printf("Storage: %s", cfg.Storage.Path)

	srv := &http.Server{
		Addr:              addr,
		Handler:           gzipMiddleware(mux),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20, // 1 MiB
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	// Wait for shutdown signal
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("Shutting down...")

	// Stop scraper first (stop writing to DB)
	close(done)

	// Wait for scraper goroutine to finish (includes gap-filler)
	select {
	case <-scraperDone:
		log.Println("Scraper stopped cleanly")
	case <-time.After(10 * time.Second):
		log.Println("Scraper shutdown timed out after 10s")
	}

	// Graceful HTTP shutdown: drain in-flight requests (5s max)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("http shutdown: %v", err)
	}

	// store.Close() runs via defer
}

// gzipMiddleware compresses text/JSON responses for clients that accept gzip.
// Uses BestSpeed to minimize CPU overhead; skips images and other binary content.
func gzipMiddleware(next http.Handler) http.Handler {
	pool := sync.Pool{
		New: func() interface{} {
			gz, _ := gzip.NewWriterLevel(io.Discard, gzip.BestSpeed)
			return gz
		},
	}

	shouldGzip := func(path string) bool {
		if path == "/api/v1/backup" {
			return false // Binary SQLite file — must not be compressed
		}
		if strings.HasPrefix(path, "/api/") {
			return true
		}
		if strings.HasPrefix(path, "/js/") || strings.HasPrefix(path, "/css/") {
			return true
		}
		if strings.HasSuffix(path, ".html") || strings.HasSuffix(path, ".svg") {
			return true
		}
		return false
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") || !shouldGzip(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		w.Header().Add("Vary", "Accept-Encoding")
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Del("Content-Length")

		gz := pool.Get().(*gzip.Writer)
		gz.Reset(w)
		defer func() {
			gz.Close()
			pool.Put(gz)
		}()

		next.ServeHTTP(&gzipResponseWriter{Writer: gz, ResponseWriter: w}, r)
	})
}

type gzipResponseWriter struct {
	io.Writer
	http.ResponseWriter
}

func (w *gzipResponseWriter) Write(b []byte) (int, error) {
	return w.Writer.Write(b)
}
