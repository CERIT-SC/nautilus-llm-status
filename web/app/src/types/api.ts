/**
 * API response types matching Go backend
 */

/** Unified status vocabulary for live models/cards. */
export type Status = 'online' | 'down' | 'archived'

export interface HealthStatus {
  prometheus_healthy: boolean
  prometheus_last_success: string
  scraper_healthy: boolean
  scraper_last_success: string
}

export interface AppConfig {
  header: string
  logo?: string
  announcement_message?: string
  announcement_type?: 'outage' | 'warning' | 'information' | 'operational'
}

export interface GpuCount {
  [name: string]: number
}

export interface ModelLatest {
  gpu_count?: GpuCount
}

export interface Model {
  id: number
  model_name: string
  namespace: string
  container: string
  status: 'online' | 'down' | 'archived'
  first_seen: string
  last_seen: string
  uptime?: boolean[]
  latest?: ModelLatest
}

export interface MetricsMeta {
  storage_name: string
  display_name: string
  unit: string
  display_scale: number
  has_labels: boolean
  summary: boolean
}

export interface MetricNameConfig {
  name: string
  label: string
  scale: number
}

export interface LabeledSeries {
  label?: string
  metric?: Record<string, string>
  points?: Array<{ timestamp: string; value: number }>
  values?: Array<[number, string]>  // Legacy format
}

export interface EndpointStatus {
  key: string
  name: string
  status: string
}

/**
 * Row in the endpoint status history table (matches Go backend).
 */
export interface EndpointStatusRow {
  checked?: string
  success: boolean
  response_time?: number
  message?: string
}

export interface EndpointStatusesResponse {
  results: EndpointStatusRow[]
  total: number
  page: number
  pageSize: number
}

export interface SuiteStatus {
  key: string
  name: string
  status: string
}

export interface HealthEvent {
  timestamp: string
  type: 'UNHEALTHY' | 'HEALTHY'
  duration?: string
  isOngoing?: boolean
}

export interface ResponseTimeHistory {
  timestamps: string[]
  values: number[]
}
