package cache

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/nautilus-llm-status/internal/config"
)

func addModel(c *Cache, id int64, name string, lastSeen time.Time) {
	c.modelsMu.Lock()
	defer c.modelsMu.Unlock()
	c.models[id] = &modelEntry{
		ID: id, Namespace: "ns", Container: name,
		ModelName: name, FirstSeen: lastSeen.Add(-time.Hour), LastSeen: lastSeen,
	}
}

func decodeModels(t *testing.T, c *Cache) []modelResponse {
	t.Helper()
	var models []modelResponse
	if err := json.Unmarshal(c.GetModelsJSON(), &models); err != nil {
		t.Fatalf("unmarshal models JSON: %v", err)
	}
	return models
}

func byName(models []modelResponse) map[string]modelResponse {
	out := make(map[string]modelResponse, len(models))
	for _, m := range models {
		out[m.ModelName] = m
	}
	return out
}

func TestModelsJSONCategories(t *testing.T) {
	c := New(config.DefaultConfig())
	now := time.Now().UTC()
	addModel(c, 1, "Whisper-large-v3", now)
	addModel(c, 2, "mxbai-embed-large:latest", now)
	addModel(c, 3, "qwen3-reranker-4b", now)
	addModel(c, 4, "Qwen3-32b", now)
	c.RebuildModelsJSON()

	models := decodeModels(t, c)
	got := byName(models)
	want := map[string]string{
		"Whisper-large-v3":        "speech",
		"mxbai-embed-large:latest": "embedding",
		"qwen3-reranker-4b":       "reranker",
		"Qwen3-32b":               "chat",
	}
	for name, cat := range want {
		m, ok := got[name]
		if !ok {
			t.Fatalf("model %q missing from JSON", name)
		}
		if m.Category != cat {
			t.Errorf("model %q category = %q, want %q", name, m.Category, cat)
		}
	}

	// Custom, explicitly prepared configuration
	cfg := config.DefaultConfig()
	cfg.Models.DefaultCategory = "other"
	cfg.Models.Categories = []config.CategoryRule{{Name: "vision", Match: []string{"clip"}}}
	if err := cfg.Models.PrepareCategories(); err != nil {
		t.Fatalf("PrepareCategories: %v", err)
	}
	c2 := New(cfg)
	addModel(c2, 10, "CLIP-ViT-L", now)
	addModel(c2, 11, "Qwen3-32b", now)
	c2.RebuildModelsJSON()

	got2 := byName(decodeModels(t, c2))
	if m := got2["CLIP-ViT-L"]; m.Category != "vision" {
		t.Errorf("custom rule: CLIP-ViT-L category = %q, want vision", m.Category)
	}
	if m := got2["Qwen3-32b"]; m.Category != "other" {
		t.Errorf("custom fallback: Qwen3-32b category = %q, want other", m.Category)
	}
}

func TestModelsJSONSortedByCategory(t *testing.T) {
	c := New(config.DefaultConfig())
	now := time.Now().UTC()
	// Inserted scrambled: speech, chat, reranker, embedding, chat
	addModel(c, 1, "Whisper-large-v3", now)
	addModel(c, 2, "Qwen3-32b", now)
	addModel(c, 3, "qwen3-reranker-4b", now)
	addModel(c, 4, "nomic-embed-text-v2-moe", now)
	addModel(c, 5, "llama-3.1-8b", now)
	c.RebuildModelsJSON()

	models := decodeModels(t, c)
	want := []string{
		// chat (fallback) first, then config rule order; names sort by the
		// pre-existing byte order within a category
		"Qwen3-32b", "llama-3.1-8b",
		"qwen3-reranker-4b",
		"nomic-embed-text-v2-moe",
		"Whisper-large-v3",
	}
	if len(models) != len(want) {
		t.Fatalf("got %d models, want %d", len(models), len(want))
	}
	for i, name := range want {
		if models[i].ModelName != name {
			t.Errorf("models[%d] = %q, want %q", i, models[i].ModelName, name)
		}
	}
}

func TestModelsJSONCategoryPreservesStatus(t *testing.T) {
	c := New(config.DefaultConfig())
	now := time.Now().UTC()

	addModel(c, 1, "Whisper-large-v3", now)                          // online
	addModel(c, 2, "Qwen3-32b", now.Add(-10*time.Minute))            // down (threshold 5m)
	addModel(c, 3, "mxbai-embed-large:latest", now.Add(-8*24*time.Hour)) // archived (threshold 7d)

	// Supply latest scalar data for model 1
	c.seriesMu.Lock()
	c.ensureSeriesMap(1, "num_requests_running")
	c.series[1]["num_requests_running"][""] = []MetricPoint{{Timestamp: now, Value: 3}}
	c.seriesMu.Unlock()

	// Supply an uptime tracker for model 1
	c.uptimeMu.Lock()
	c.uptime[1] = &uptimeTracker{baseTime: uptimeBase(now)}
	c.uptime[1].counts[0] = 100
	c.uptimeMu.Unlock()

	c.RebuildModelsJSON()

	models := decodeModels(t, c)
	got := byName(models)

	statusWant := map[string]string{
		"Whisper-large-v3":         "online",
		"Qwen3-32b":                "down",
		"mxbai-embed-large:latest": "archived",
	}
	for name, want := range statusWant {
		m, ok := got[name]
		if !ok {
			t.Fatalf("model %q missing from JSON", name)
		}
		if m.Status != want {
			t.Errorf("model %q status = %q, want %q", name, m.Status, want)
		}
	}

	if m := got["Whisper-large-v3"]; m.Category != "speech" {
		t.Errorf("online model category = %q, want speech", m.Category)
	}
	if m := got["Qwen3-32b"]; m.Category != "chat" {
		t.Errorf("down model category = %q, want chat", m.Category)
	}
	if m := got["mxbai-embed-large:latest"]; m.Category != "embedding" {
		t.Errorf("archived model category = %q, want embedding", m.Category)
	}

	// IDs, names; ordering is by category rank (chat, reranker, embedding,
	// speech) then name
	if got["Whisper-large-v3"].ID != 1 || got["Qwen3-32b"].ID != 2 || got["mxbai-embed-large:latest"].ID != 3 {
		t.Errorf("IDs changed: %+v", got)
	}
	wantOrder := []string{"Qwen3-32b", "mxbai-embed-large:latest", "Whisper-large-v3"}
	for i, name := range wantOrder {
		if models[i].ModelName != name {
			t.Errorf("models[%d] = %q, want %q (category-then-name order)", i, models[i].ModelName, name)
		}
	}

	// Supplied latest data unchanged
	latest, ok := got["Whisper-large-v3"].Latest["num_requests_running"].(float64)
	if !ok || latest != 3 {
		t.Errorf("latest num_requests_running = %v, want 3", got["Whisper-large-v3"].Latest["num_requests_running"])
	}

	// Supplied uptime data unchanged
	if up := got["Whisper-large-v3"].Uptime; up == nil || len(up) != uptimeBuckets || !up[0] {
		t.Errorf("uptime buckets = %v, want len %d with bucket[0] true", up, uptimeBuckets)
	}
	if up := got["Qwen3-32b"].Uptime; up != nil {
		t.Errorf("model without tracker has uptime %v, want nil", up)
	}
}
