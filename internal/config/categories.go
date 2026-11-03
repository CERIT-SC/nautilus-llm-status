package config

import (
	"fmt"
	"regexp"
)

// CategoryRule assigns models whose name matches any pattern to one
// category. Patterns are matched case-insensitively; within a rule they
// are ORed, and across rules the first matching rule wins.
type CategoryRule struct {
	Name  string   `yaml:"name"`
	Match []string `yaml:"match"`
}

// compiledRule is a validated category rule with its patterns compiled.
type compiledRule struct {
	name string
	res  []*regexp.Regexp
}

func (r compiledRule) matches(modelName string) bool {
	for _, re := range r.res {
		if re.MatchString(modelName) {
			return true
		}
	}
	return false
}

// compiledCategories is the immutable result of a successful
// PrepareCategories. A single pointer swap replaces it, so readers
// never observe a half-updated rule set.
type compiledCategories struct {
	rules    []compiledRule
	fallback string
}

// categoryNameRe constrains category identifiers used in config and in
// the UI.
var categoryNameRe = regexp.MustCompile(`^[a-z][a-z0-9_-]*$`)

// defaultCategoryRules is the shipped classification. Order matters:
// more specific rules must precede broader ones so that e.g.
// BAAI/bge-reranker-v2-m3 classifies as reranker, not embedding.
func defaultCategoryRules() []CategoryRule {
	return []CategoryRule{
		{Name: "reranker", Match: []string{"rerank"}},
		{Name: "embedding", Match: []string{
			"embed",
			`(^|[/_:.-])(e5|bge|gte)([/_:.-]|$)`,
			"mxbai",
			"nomic",
		}},
		{Name: "speech", Match: []string{"whisper", "canary", "tts", "asr", "speech", "parakeet"}},
	}
}

// PrepareCategories validates DefaultCategory and Categories and
// compiles every pattern case-insensitively. On error the previously
// compiled state (if any) is left untouched; on success it is replaced
// in one step.
func (m *ModelsConfig) PrepareCategories() error {
	if m.DefaultCategory == "" {
		return fmt.Errorf(`models.default_category must not be empty (set it to e.g. "chat")`)
	}
	if err := validateCategoryName(m.DefaultCategory); err != nil {
		return fmt.Errorf("models.default_category %q: %w", m.DefaultCategory, err)
	}

	seen := make(map[string]bool, len(m.Categories))
	rules := make([]compiledRule, 0, len(m.Categories))
	for _, rule := range m.Categories {
		if rule.Name == "" {
			return fmt.Errorf("category rule name must not be empty")
		}
		if rule.Name == "all" {
			return fmt.Errorf(`category rule name "all" is reserved`)
		}
		if err := validateCategoryName(rule.Name); err != nil {
			return fmt.Errorf("category rule name %q: %w", rule.Name, err)
		}
		if seen[rule.Name] {
			return fmt.Errorf("duplicate category rule name %q", rule.Name)
		}
		seen[rule.Name] = true

		if len(rule.Match) == 0 {
			return fmt.Errorf("category rule %q: match must not be empty", rule.Name)
		}
		compiled := compiledRule{name: rule.Name}
		for _, pattern := range rule.Match {
			if pattern == "" {
				return fmt.Errorf("category rule %q: pattern must not be empty", rule.Name)
			}
			// Validate the bare pattern first: wrapping as (?i:...) can
			// otherwise make some malformed patterns (e.g. "a)|(b")
			// silently compile with unintended semantics.
			if _, err := regexp.Compile(pattern); err != nil {
				return fmt.Errorf("category rule %q: invalid pattern %q: %w", rule.Name, pattern, err)
			}
			re, err := regexp.Compile("(?i:" + pattern + ")")
			if err != nil {
				return fmt.Errorf("category rule %q: invalid pattern %q: %w", rule.Name, pattern, err)
			}
			compiled.res = append(compiled.res, re)
		}
		rules = append(rules, compiled)
	}

	m.compiled = &compiledCategories{rules: rules, fallback: m.DefaultCategory}
	return nil
}

func validateCategoryName(name string) error {
	if !categoryNameRe.MatchString(name) {
		return fmt.Errorf("must match ^[a-z][a-z0-9_-]*$")
	}
	return nil
}

// Classify returns the category for a model name: the first matching
// rule's category, or the configured fallback. Zero-value (unprepared)
// configuration classifies everything as "chat" and never compiles or
// touches regexes.
func (m *ModelsConfig) Classify(modelName string) string {
	if m == nil || m.compiled == nil {
		return "chat"
	}
	for _, rule := range m.compiled.rules {
		if rule.matches(modelName) {
			return rule.name
		}
	}
	return m.compiled.fallback
}
