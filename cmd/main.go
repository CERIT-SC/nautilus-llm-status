package main

import (
	"context"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/nautilus-llm-status/internal/api"
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

	prom := scraper.NewPromClient(cfg.Prometheus.URL, cfg.Prometheus.QueryTimeout)
	sc := scraper.New(prom, store, cfg)

	done := make(chan struct{})
	go sc.Run(done)

	apiServer := api.New(store, sc, cfg)

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

	srv := &http.Server{Addr: addr, Handler: mux}

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

	// Graceful HTTP shutdown: drain in-flight requests (5s max)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	srv.Shutdown(ctx)

	// Stop scraper
	close(done)

	// store.Close() runs via defer
}
