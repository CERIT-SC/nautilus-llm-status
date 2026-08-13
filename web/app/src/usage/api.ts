import type { Granularity, Me, UsageResponse } from "./types";

const BASE = "/usage/api";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: "include", ...init });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* keep statusText */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

/** Returns null when nobody is signed in. */
export async function fetchMe(): Promise<Me | null> {
  try {
    return await request<Me>("/me");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export function fetchUsage(
  params: { granularity: Granularity; start: string; end: string },
  signal?: AbortSignal,
): Promise<UsageResponse> {
  const query = new URLSearchParams(params as Record<string, string>);
  return request<UsageResponse>(`/usage?${query}`, { signal });
}

export async function signOut(): Promise<string> {
  const body = await request<{ redirect: string }>("/auth/logout", { method: "POST" });
  return body.redirect;
}

export const signInUrl = `${BASE}/auth/login`;
