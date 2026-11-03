package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func defaultClassify(t *testing.T, name string) string {
	t.Helper()
	cfg := DefaultConfig()
	return cfg.Models.Classify(name)
}

func TestDefaultCategories(t *testing.T) {
	cases := []struct {
		name string
		want string
	}{
		{"Whisper-large-v3", "speech"},
		{"nvidia/canary-1b", "speech"},
		{"NOMic-embed-text", "embedding"},
		{"multilingual-e5-large-instruct", "embedding"},
		{"BAAI/bge-reranker-v2-m3", "reranker"},
		{"Qwen3-32b", "chat"},
		{"", "chat"},
		{"budget-model", "chat"},
	}
	for _, tc := range cases {
		if got := defaultClassify(t, tc.name); got != tc.want {
			t.Errorf("Classify(%q) = %q, want %q", tc.name, got, tc.want)
		}
	}
}

func TestCategoryRuleOrder(t *testing.T) {
	first := CategoryRule{Name: "first", Match: []string{"model"}}
	second := CategoryRule{Name: "second", Match: []string{"model"}}

	m := &ModelsConfig{DefaultCategory: "fallback", Categories: []CategoryRule{first, second}}
	if err := m.PrepareCategories(); err != nil {
		t.Fatalf("PrepareCategories: %v", err)
	}
	if got := m.Classify("some-model"); got != "first" {
		t.Errorf("Classify with [first, second] = %q, want %q", got, "first")
	}

	m2 := &ModelsConfig{DefaultCategory: "fallback", Categories: []CategoryRule{second, first}}
	if err := m2.PrepareCategories(); err != nil {
		t.Fatalf("PrepareCategories: %v", err)
	}
	if got := m2.Classify("some-model"); got != "second" {
		t.Errorf("Classify with [second, first] = %q, want %q", got, "second")
	}
}

func TestCustomCategories(t *testing.T) {
	m := &ModelsConfig{
		DefaultCategory: "other",
		Categories: []CategoryRule{
			{Name: "vision", Match: []string{"clip", "ViT-"}},
		},
	}
	if err := m.PrepareCategories(); err != nil {
		t.Fatalf("PrepareCategories: %v", err)
	}

	// OR semantics + case-insensitive matching
	if got := m.Classify("CLIP-ViT-L"); got != "vision" {
		t.Errorf("Classify(%q) = %q, want %q", "CLIP-ViT-L", got, "vision")
	}
	// custom fallback for unmatched names
	if got := m.Classify("qwen3-32b"); got != "other" {
		t.Errorf("Classify(%q) = %q, want custom fallback %q", "qwen3-32b", got, "other")
	}
}

func TestInvalidCategories(t *testing.T) {
	cases := []struct {
		label   string
		cfg     ModelsConfig
		wantIn  []string // substrings expected in the error message
	}{
		{
			label:  "malformed regex",
			cfg:    ModelsConfig{DefaultCategory: "chat", Categories: []CategoryRule{{Name: "bad", Match: []string{"["}}}},
			wantIn: []string{`"bad"`, "["},
		},
		{
			label:  "unbalanced groups survive case-wrapping",
			cfg:    ModelsConfig{DefaultCategory: "chat", Categories: []CategoryRule{{Name: "sneaky", Match: []string{"a)|(b"}}}},
			wantIn: []string{`"sneaky"`, "a)|(b"},
		},
		{
			label:  "empty rule name",
			cfg:    ModelsConfig{DefaultCategory: "chat", Categories: []CategoryRule{{Name: "", Match: []string{"x"}}}},
			wantIn: []string{"name"},
		},
		{
			label: "duplicate rule names",
			cfg: ModelsConfig{DefaultCategory: "chat", Categories: []CategoryRule{
				{Name: "dup", Match: []string{"a"}},
				{Name: "dup", Match: []string{"b"}},
			}},
			wantIn: []string{`"dup"`},
		},
		{
			label:  "reserved rule name",
			cfg:    ModelsConfig{DefaultCategory: "chat", Categories: []CategoryRule{{Name: "all", Match: []string{"x"}}}},
			wantIn: []string{"all"},
		},
		{
			label:  "bad identifier",
			cfg:    ModelsConfig{DefaultCategory: "chat", Categories: []CategoryRule{{Name: "Bad Name", Match: []string{"x"}}}},
			wantIn: []string{"Bad Name"},
		},
		{
			label:  "bad identifier leading digit",
			cfg:    ModelsConfig{DefaultCategory: "chat", Categories: []CategoryRule{{Name: "1bad", Match: []string{"x"}}}},
			wantIn: []string{"1bad"},
		},
		{
			label:  "empty match slice",
			cfg:    ModelsConfig{DefaultCategory: "chat", Categories: []CategoryRule{{Name: "x", Match: nil}}},
			wantIn: []string{`"x"`},
		},
		{
			label:  "empty regex pattern",
			cfg:    ModelsConfig{DefaultCategory: "chat", Categories: []CategoryRule{{Name: "x", Match: []string{""}}}},
			wantIn: []string{`"x"`},
		},
		{
			label:  "explicit empty fallback",
			cfg:    ModelsConfig{DefaultCategory: "", Categories: []CategoryRule{{Name: "x", Match: []string{"y"}}}},
			wantIn: []string{"default_category"},
		},
	}
	for _, tc := range cases {
		cfg := tc.cfg
		err := cfg.PrepareCategories()
		if err == nil {
			t.Errorf("%s: expected error, got nil", tc.label)
			continue
		}
		for _, substr := range tc.wantIn {
			if !strings.Contains(err.Error(), substr) {
				t.Errorf("%s: error %q does not contain %q", tc.label, err.Error(), substr)
			}
		}
	}
}

func writeCfg(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestLoadCategoryOverrides(t *testing.T) {
	t.Run("omitted fields retain defaults", func(t *testing.T) {
		cfg, err := Load(writeCfg(t, "prometheus:\n  url: https://example.com\n"))
		if err != nil {
			t.Fatalf("Load: %v", err)
		}
		if got := cfg.Models.Classify("Whisper-large-v3"); got != "speech" {
			t.Errorf("Classify = %q, want speech", got)
		}
	})

	t.Run("supplied list replaces defaults", func(t *testing.T) {
		cfg, err := Load(writeCfg(t, "models:\n  default_category: llm\n  categories:\n    - name: big\n      match: ['70b', '405b']\n"))
		if err != nil {
			t.Fatalf("Load: %v", err)
		}
		if got := cfg.Models.Classify("llama-3.3-70b"); got != "big" {
			t.Errorf("Classify = %q, want big", got)
		}
		if got := cfg.Models.Classify("Whisper-large-v3"); got != "llm" {
			t.Errorf("Classify = %q, want llm (defaults replaced)", got)
		}
	})

	t.Run("empty categories list disables matching", func(t *testing.T) {
		cfg, err := Load(writeCfg(t, "models:\n  categories: []\n"))
		if err != nil {
			t.Fatalf("Load: %v", err)
		}
		if got := cfg.Models.Classify("Whisper-large-v3"); got != "chat" {
			t.Errorf("Classify = %q, want fallback chat", got)
		}
	})

	t.Run("no path keeps defaults usable", func(t *testing.T) {
		cfg, err := Load("")
		if err != nil {
			t.Fatalf("Load: %v", err)
		}
		if got := cfg.Models.Classify("Whisper-large-v3"); got != "speech" {
			t.Errorf("Classify = %q, want speech", got)
		}
	})

	t.Run("missing path keeps defaults usable", func(t *testing.T) {
		cfg, err := Load(filepath.Join(t.TempDir(), "does-not-exist.yaml"))
		if err != nil {
			t.Fatalf("Load: %v", err)
		}
		if got := cfg.Models.Classify("Whisper-large-v3"); got != "speech" {
			t.Errorf("Classify = %q, want speech", got)
		}
	})

	t.Run("malformed yaml is an error", func(t *testing.T) {
		if _, err := Load(writeCfg(t, "not: [valid\n")); err == nil {
			t.Fatal("expected error for malformed YAML, got nil")
		}
	})

	t.Run("invalid category config is an error", func(t *testing.T) {
		if _, err := Load(writeCfg(t, "models:\n  categories:\n    - name: bad\n      match: ['[']\n")); err == nil {
			t.Fatal("expected error for invalid category config, got nil")
		}
	})

	t.Run("repeated prepare replaces compiled rules", func(t *testing.T) {
		m := &ModelsConfig{DefaultCategory: "a", Categories: []CategoryRule{{Name: "r1", Match: []string{"x"}}}}
		if err := m.PrepareCategories(); err != nil {
			t.Fatalf("PrepareCategories: %v", err)
		}
		if got := m.Classify("x"); got != "r1" {
			t.Errorf("Classify = %q, want r1", got)
		}
		m.Categories = []CategoryRule{{Name: "r2", Match: []string{"y"}}}
		if err := m.PrepareCategories(); err != nil {
			t.Fatalf("PrepareCategories: %v", err)
		}
		if got := m.Classify("x"); got != "a" {
			t.Errorf("Classify(x) after re-prepare = %q, want fallback a (stale rule retained)", got)
		}
		if got := m.Classify("y"); got != "r2" {
			t.Errorf("Classify(y) after re-prepare = %q, want r2", got)
		}
	})
}
