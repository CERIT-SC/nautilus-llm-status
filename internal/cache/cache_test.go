package cache

import (
	"testing"

	"github.com/nautilus-llm-status/internal/config"
)

func TestReadyDefaultsFalse(t *testing.T) {
	c := New(config.DefaultConfig())
	if c.IsReady() {
		t.Fatal("new cache must not be ready")
	}
}

func TestSetReady(t *testing.T) {
	c := New(config.DefaultConfig())
	c.SetReady(true)
	if !c.IsReady() {
		t.Fatal("cache must be ready after SetReady(true)")
	}
	c.SetReady(false)
	if c.IsReady() {
		t.Fatal("cache must not be ready after SetReady(false)")
	}
}
