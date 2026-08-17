export type Granularity = "day" | "week" | "month" | "year";

export interface Metrics {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  /** Subset of prompt_tokens served from the provider's prompt cache. */
  cache_read_input_tokens: number;
  /** prompt_tokens minus cache reads. */
  uncached_prompt_tokens: number;
  /** 0..1 share of prompt tokens that were cache hits. */
  cache_read_share: number;
  /** Anthropic-only cache writes. Billable. */
  cache_creation_input_tokens: number;
  /** Tokens prompt compression kept out of the request (LiteLLM 1.95+). */
  compression_saved_tokens: number;
  spend: number;
  prompt_caching_savings_spend: number;
  compression_savings_spend: number;
  savings_spend: number;
  spend_without_savings: number;
  api_requests: number;
  successful_requests: number;
  failed_requests: number;
}

export interface ModelUsage extends Metrics {
  model: string;
}

export interface Bucket {
  key: string;
  label: string;
  start: string;
  end: string;
  partial: boolean;
  totals: Metrics;
  models: ModelUsage[];
}

export interface UsageResponse {
  source: "daily" | "enduser" | "spendlogs" | "none";
  linked: boolean;
  granularity: Granularity;
  start: string;
  end: string;
  totals: Metrics;
  models: ModelUsage[];
  buckets: Bucket[];
}

export interface Me {
  sub: string;
  identifier: string;
  brokered: boolean;
  connector: string | null;
  candidates: string[];
  email: string | null;
  name: string | null;
  /** True when there is usage to show, by account row or by spend rows. */
  linked: boolean;
  account_row_found: boolean;
  has_usage_rows: boolean;
  row_counts: Record<string, number>;
  match_strategy: string;
  matched_identifier: string | null;
  /** "strong" = matched the OIDC subject, "weak" = matched a username. */
  matched_via: string | null;
  weak_candidates: string[];
  /** Every sso_user_id value that would match this person. */
  accepted_sso_user_ids: string[];
  litellm_user_ids: string[];
  matched_sso_user_ids: string[];
  expected_sso_user_id: string;
}

export type MetricKey =
  "total_tokens" | "cache_read_input_tokens" | "spend" | "api_requests";
