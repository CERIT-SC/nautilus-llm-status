package main

import (
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
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

	// API routes under /status
	mux.Handle("/status/api/", apiServer.Handler())

	// Reverse proxy /usage/api/ → llm-stats usage backend /api/
	// The usage backend is a separate Python (FastAPI) service handling OIDC
	// auth and usage queries. The session cookie stays first-party (same origin).
	usageBackendURL, err := url.Parse(cfg.Usage.BackendURL)
	if err != nil {
		log.Fatalf("invalid usage backend URL %q: %v", cfg.Usage.BackendURL, err)
	}
	usageProxy := httputil.NewSingleHostReverseProxy(usageBackendURL)
	usageDirector := usageProxy.Director
	usageProxy.Director = func(r *http.Request) {
		usageDirector(r)
		// Rewrite /usage/api/... → /api/... on the upstream
		r.URL.Path = strings.TrimPrefix(r.URL.Path, "/usage")
		r.URL.RawPath = strings.TrimPrefix(r.URL.RawPath, "/usage")
	}
	// Personal usage data must not sit in any shared cache.
	usageProxy.ModifyResponse = func(r *http.Response) error {
		r.Header.Set("Cache-Control", "no-store")
		return nil
	}
	mux.Handle("/usage/api/", usageProxy)

	// Static files (SPA) embedded in the binary.
	staticFS, err := fs.Sub(static.FileSystem, static.RootPath)
	if err != nil {
		log.Fatalf("static fs: %v", err)
	}
	fileServer := http.FileServer(http.FS(staticFS))
	httpFS := http.FS(staticFS)

	mux.HandleFunc("/usage/", func(w http.ResponseWriter, r *http.Request) {
		serveEmbeddedFile(w, r, httpFS, "index.html")
	})
	mux.HandleFunc("/usage", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/usage" {
			http.NotFound(w, r)
			return
		}
		serveEmbeddedFile(w, r, httpFS, "index.html")
	})

	log.Printf("Usage backend: %s", cfg.Usage.BackendURL)

	// SPA fallback: serve index.html for any non-API, non-file route under /status
	mux.HandleFunc("/status/", func(w http.ResponseWriter, r *http.Request) {
		// Strip /status prefix for file lookup
		path := strings.TrimPrefix(r.URL.Path, "/status")

		// Static asset cache headers (Vue build uses content hashes)
		if strings.HasPrefix(path, "/js/") || strings.HasPrefix(path, "/css/") || strings.HasPrefix(path, "/img/") {
			w.Header().Set("Cache-Control", "public, max-age=3600")
		}

		// Root of /status/ serves index.html directly - avoid file server directory redirect
		if path == "" || path == "/" {
			serveEmbeddedFile(w, r, httpFS, "index.html")
			return
		}

		// Try to serve the requested file
		path = strings.TrimPrefix(path, "/")
		_, err := staticFS.Open(path)
		if err != nil {
			// SPA fallback: serve index.html for client-side routes
			serveEmbeddedFile(w, r, httpFS, "index.html")
			return
		}

		// Serve static asset - rewrite URL for file server
		r.URL.Path = "/" + path
		fileServer.ServeHTTP(w, r)
	})

	// Handle /status (without trailing slash) - redirect to /status/
	mux.HandleFunc("/status", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/status/", http.StatusMovedPermanently)
	})

	// Redirect root to /status/
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.Redirect(w, r, "/status/", http.StatusMovedPermanently)
			return
		}
		http.NotFound(w, r)
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

// serveEmbeddedFile serves a file from the embedded filesystem
func serveEmbeddedFile(w http.ResponseWriter, r *http.Request, fs http.FileSystem, name string) {
	f, err := fs.Open(name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()

	// Determine content type
	contentType := "text/html; charset=utf-8"
	if strings.HasSuffix(name, ".js") {
		contentType = "application/javascript"
	} else if strings.HasSuffix(name, ".css") {
		contentType = "text/css"
	} else if strings.HasSuffix(name, ".svg") {
		contentType = "image/svg+xml"
	} else if strings.HasSuffix(name, ".png") {
		contentType = "image/png"
	} else if strings.HasSuffix(name, ".ico") {
		contentType = "image/x-icon"
	}
	w.Header().Set("Content-Type", contentType)
	io.Copy(w, f)
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
		if path == "/status/api/v1/backup" {
			return false // Binary SQLite file — must not be compressed
		}
		if strings.HasPrefix(path, "/status/api/") {
			return true
		}
		if strings.HasPrefix(path, "/usage/api/") {
			return true
		}
		if strings.HasPrefix(path, "/status/js/") || strings.HasPrefix(path, "/status/css/") {
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
