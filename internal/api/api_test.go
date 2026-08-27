package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/nautilus-llm-status/internal/cache"
	"github.com/nautilus-llm-status/internal/config"
)

func TestReadyNotReadyReturns503(t *testing.T) {
	s := New(nil, cache.New(config.DefaultConfig()), config.DefaultConfig())

	rr := httptest.NewRecorder()
	s.Handler().ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/status/api/v1/ready", nil))

	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 before gap-fill, got %d", rr.Code)
	}
	var body map[string]bool
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body["ready"] {
		t.Fatal("body must be {\"ready\":false} before gap-fill")
	}
}

func TestReadyAfterGapFillReturns200(t *testing.T) {
	c := cache.New(config.DefaultConfig())
	c.SetReady(true)
	s := New(nil, c, config.DefaultConfig())

	rr := httptest.NewRecorder()
	s.Handler().ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/status/api/v1/ready", nil))

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 after gap-fill, got %d", rr.Code)
	}
	var body map[string]bool
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if !body["ready"] {
		t.Fatal("body must be {\"ready\":true} after gap-fill")
	}
}
