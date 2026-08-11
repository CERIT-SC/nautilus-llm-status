package scraper

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

type PromClient struct {
	baseURL    string
	httpClient *http.Client
}

func NewPromClient(baseURL string, timeout time.Duration) *PromClient {
	return &PromClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

// InstantQuery runs a PromQL instant query and returns the raw result.
type PromResult struct {
	Metric map[string]string `json:"metric"`
	Value  [2]interface{}    `json:"value"` // [timestamp, "value_string"]
}

type PromRangeResult struct {
	Metric map[string]string `json:"metric"`
	Values [][2]interface{}  `json:"values"` // [[timestamp, "value_string"], ...]
}

type promResponse struct {
	Status string `json:"status"`
	Data   struct {
		ResultType string          `json:"resultType"`
		Result     json.RawMessage `json:"result"`
	} `json:"data"`
	Error     string `json:"error"`
	ErrorType string `json:"errorType"`
}

// renameModelName renames specific model names to their display names.
func renameModelName(modelName string) string {
	if modelName == "llama-4-scout-17b-16e-instruct" {
		return "Redhatai-scout"
	}

	// Models that should not have their first letter capitalized
	noCapitalize := map[string]bool{
		"multilingual-e5-large-instruct": true,
		"mxbai-embed-large:latest":       true,
		"nomic-embed-text-v1.5":          true,
		"nomic-embed-text-v2-moe":        true,
		"qwen3-embedding-4b":             true,
		"qwen3-reranker-4b":              true,
	}

	if noCapitalize[modelName] {
		return modelName
	}

	// Capitalize first letter for all other models
	if len(modelName) > 0 {
		return string(modelName[0]-32) + modelName[1:]
	}
	return modelName
}

// renameMetricModels renames model_name labels in metric maps.
func renameMetricModels(metric map[string]string) {
	if modelName, ok := metric["model_name"]; ok {
		metric["model_name"] = renameModelName(modelName)
	}
}

func (c *PromClient) InstantQuery(query string) ([]PromResult, time.Duration, error) {
	u := fmt.Sprintf("%s/api/v1/query?query=%s", c.baseURL, url.QueryEscape(query))

	start := time.Now()
	resp, err := c.httpClient.Get(u)
	latency := time.Since(start)
	if err != nil {
		return nil, latency, fmt.Errorf("prometheus query: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, latency, fmt.Errorf("prometheus returned HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20)) // 10 MiB limit
	if err != nil {
		return nil, latency, fmt.Errorf("read body: %w", err)
	}

	var pr promResponse
	if err := json.Unmarshal(body, &pr); err != nil {
		return nil, latency, fmt.Errorf("unmarshal: %w", err)
	}
	if pr.Status != "success" {
		return nil, latency, fmt.Errorf("prometheus error: %s: %s", pr.ErrorType, pr.Error)
	}

	var results []PromResult
	if err := json.Unmarshal(pr.Data.Result, &results); err != nil {
		return nil, latency, fmt.Errorf("unmarshal results: %w", err)
	}
	for i := range results {
		renameMetricModels(results[i].Metric)
	}
	return results, latency, nil
}

func (c *PromClient) RangeQuery(query string, start, end time.Time, step time.Duration) ([]PromRangeResult, error) {
	u := fmt.Sprintf("%s/api/v1/query_range?query=%s&start=%s&end=%s&step=%s",
		c.baseURL,
		url.QueryEscape(query),
		url.QueryEscape(start.Format(time.RFC3339)),
		url.QueryEscape(end.Format(time.RFC3339)),
		url.QueryEscape(fmt.Sprintf("%ds", int(step.Seconds()))),
	)

	resp, err := c.httpClient.Get(u)
	if err != nil {
		return nil, fmt.Errorf("prometheus range query: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("prometheus returned HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20)) // 10 MiB limit
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	var pr promResponse
	if err := json.Unmarshal(body, &pr); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}
	if pr.Status != "success" {
		return nil, fmt.Errorf("prometheus error: %s: %s", pr.ErrorType, pr.Error)
	}

	var results []PromRangeResult
	if err := json.Unmarshal(pr.Data.Result, &results); err != nil {
		return nil, fmt.Errorf("unmarshal range results: %w", err)
	}
	for i := range results {
		renameMetricModels(results[i].Metric)
	}
	return results, nil
}

// ParseValue extracts the float64 from a Prometheus value pair.
func ParseValue(v [2]interface{}) (time.Time, float64, error) {
	ts, ok := v[0].(float64)
	if !ok {
		return time.Time{}, 0, fmt.Errorf("timestamp not a float64")
	}
	valStr, ok := v[1].(string)
	if !ok {
		return time.Time{}, 0, fmt.Errorf("value not a string")
	}
	val, err := strconv.ParseFloat(valStr, 64)
	if err != nil {
		return time.Time{}, 0, fmt.Errorf("parse value %q: %w", valStr, err)
	}
	sec, frac := math.Modf(ts)
	return time.Unix(int64(sec), int64(frac*1e9)).UTC(), val, nil
}
