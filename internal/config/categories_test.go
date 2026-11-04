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

func TestCategoryRank(t *testing.T) {
	cfg := DefaultConfig()
	// Shipped rule order: reranker, embedding, speech; fallback chat.
	ranks := map[string]int{
		"chat":      0, // default category sorts first
		"reranker":  1,
		"embedding": 2,
		"speech":    3,
	}
	for cat, want := range ranks {
		if got := cfg.Models.CategoryRank(cat); got != want {
			t.Errorf("CategoryRank(%q) = %d, want %d", cat, got, want)
		}
	}
	if got := cfg.Models.CategoryRank("nonexistent"); got != 0 {
		t.Errorf("CategoryRank(unknown) = %d, want 0", got)
	}

	// Custom config: fallback first, then rules in declared order
	custom := &ModelsConfig{
		DefaultCategory: "other",
		Categories: []CategoryRule{
			{Name: "vision", Match: []string{"clip"}},
			{Name: "audio", Match: []string{"whisper"}},
		},
	}
	if err := custom.PrepareCategories(); err != nil {
		t.Fatalf("PrepareCategories: %v", err)
	}
	if got := custom.CategoryRank("other"); got != 0 {
		t.Errorf("custom fallback rank = %d, want 0", got)
	}
	if got := custom.CategoryRank("vision"); got != 1 {
		t.Errorf("vision rank = %d, want 1", got)
	}
	if got := custom.CategoryRank("audio"); got != 2 {
		t.Errorf("audio rank = %d, want 2", got)
	}
}

func TestCategoryLabels(t *testing.T) {
	t.Run("defaults title-case to the shipped labels", func(t *testing.T) {
		cfg := DefaultConfig()
		got := cfg.Models.CategoryLabels()
		want := []CategoryLabel{
			{Name: "chat", Label: "Chat"},
			{Name: "reranker", Label: "Reranker"},
			{Name: "embedding", Label: "Embedding"},
			{Name: "speech", Label: "Speech"},
		}
		if len(got) != len(want) {
			t.Fatalf("got %d labels, want %d: %+v", len(got), len(want), got)
		}
		for i := range want {
			if got[i] != want[i] {
				t.Errorf("labels[%d] = %+v, want %+v", i, got[i], want[i])
			}
		}
	})

	t.Run("explicit label wins, unlabeled rules title-case", func(t *testing.T) {
		cfg := DefaultConfig()
		cfg.Models.Categories = []CategoryRule{
			{Name: "decision", Match: []string{"sr-d3"}, Label: "LLM judge"},
			{Name: "vision-support", Match: []string{"clip"}},
		}
		if err := cfg.Models.PrepareCategories(); err != nil {
			t.Fatalf("PrepareCategories: %v", err)
		}
		got := cfg.Models.CategoryLabels()
		want := []CategoryLabel{
			{Name: "chat", Label: "Chat"}, // fallback, not a rule
			{Name: "decision", Label: "LLM judge"},
			{Name: "vision-support", Label: "Vision Support"},
		}
		if len(got) != len(want) {
			t.Fatalf("got %d labels, want %d: %+v", len(got), len(want), got)
		}
		for i := range want {
			if got[i] != want[i] {
				t.Errorf("labels[%d] = %+v, want %+v", i, got[i], want[i])
			}
		}
	})

	t.Run("rule sharing the fallback name provides its label", func(t *testing.T) {
		cfg := DefaultConfig()
		cfg.Models.Categories = []CategoryRule{{Name: "chat", Match: []string{"never"}, Label: "Dialogue"}}
		if err := cfg.Models.PrepareCategories(); err != nil {
			t.Fatalf("PrepareCategories: %v", err)
		}
		for _, cl := range cfg.Models.CategoryLabels() {
			if cl.Name == "chat" && cl.Label != "Dialogue" {
				t.Errorf("chat label = %q, want rule label Dialogue", cl.Label)
			}
		}
	})
}

func TestLoadModelsConfigEnv(t *testing.T) {
	t.Run("env fragment overrides defaults", func(t *testing.T) {
		t.Setenv("MODELS_CONFIG", "default_category: llm\ncategories:\n  - name: big\n    match: ['70b']\n")
		cfg, err := Load("")
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

	t.Run("env overrides config file", func(t *testing.T) {
		t.Setenv("MODELS_CONFIG", "default_category: chat\ncategories:\n  - name: fromenv\n    match: ['envmatch']\n")
		cfg, err := Load(writeCfg(t, "models:\n  categories:\n    - name: fromfile\n      match: ['filematch']\n"))
		if err != nil {
			t.Fatalf("Load: %v", err)
		}
		if got := cfg.Models.Classify("x-envmatch"); got != "fromenv" {
			t.Errorf("Classify = %q, want fromenv", got)
		}
		if got := cfg.Models.Classify("x-filematch"); got != "chat" {
			t.Errorf("Classify = %q, want chat (file rules replaced by env)", got)
		}
	})

	t.Run("invalid yaml fails and names the env var", func(t *testing.T) {
		t.Setenv("MODELS_CONFIG", "not: [valid")
		if _, err := Load(""); err == nil {
			t.Fatal("expected error for invalid MODELS_CONFIG yaml, got nil")
		} else if !strings.Contains(err.Error(), "MODELS_CONFIG") {
			t.Errorf("error %q does not mention MODELS_CONFIG", err.Error())
		}
	})

	t.Run("unknown keys fail loudly", func(t *testing.T) {
		t.Setenv("MODELS_CONFIG", "models:\n  default_category: chat\n")
		if _, err := Load(""); err == nil {
			t.Fatal("expected error for wrapped models: key in MODELS_CONFIG, got nil")
		} else if !strings.Contains(err.Error(), "MODELS_CONFIG") {
			t.Errorf("error %q does not mention MODELS_CONFIG", err.Error())
		}
	})

	t.Run("invalid category rules fail", func(t *testing.T) {
		t.Setenv("MODELS_CONFIG", "categories:\n  - name: bad\n    match: ['[']\n")
		if _, err := Load(""); err == nil {
			t.Fatal("expected error for invalid rules in MODELS_CONFIG, got nil")
		}
	})

	t.Run("unset env keeps file behavior", func(t *testing.T) {
		t.Setenv("MODELS_CONFIG", "")
		cfg, err := Load("")
		if err != nil {
			t.Fatalf("Load: %v", err)
		}
		if got := cfg.Models.Classify("Whisper-large-v3"); got != "speech" {
			t.Errorf("Classify = %q, want speech (defaults)", got)
		}
	})
}
