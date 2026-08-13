export type Granularity = "day" | "week" | "month" | "year";

export interface Metrics {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  spend: number;
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
  source: "daily" | "spendlogs" | "none";
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
  linked: boolean;
  match_strategy: string;
  matched_identifier: string | null;
  litellm_user_ids: string[];
  matched_sso_user_ids: string[];
  expected_sso_user_id: string;
}

export type MetricKey = "total_tokens" | "spend" | "api_requests";
