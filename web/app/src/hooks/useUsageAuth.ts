import { useCallback, useEffect, useState } from "react";
import { fetchMe, signOut } from "../usage/api";
import type { Me } from "../usage/types";

interface UsageAuthState {
  me: Me | null;
  loading: boolean;
  /** Sign out and redirect. Returns a promise so callers can await if needed. */
  signOutUsage: () => Promise<void>;
}

/**
 * Check the usage-auth state for the header identity badge.
 *
 * Fetches /usage/api/me on mount. A 401 means "not signed in" (null me, no
 * error). The hook is intentionally lightweight: it does not retry or refetch
 * — navigating to /usage and back will remount the header and re-check.
 */
export function useUsageAuth(): UsageAuthState {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    fetchMe()
      .then((result) => {
        if (!live) return;
        setMe(result);
      })
      .catch(() => {
        // Network errors etc. — just show no identity.
        if (!live) return;
        setMe(null);
      })
      .finally(() => {
        if (!live) return;
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const signOutUsage = useCallback(async () => {
    try {
      const target = await signOut();
      const parsed = new URL(target, window.location.origin);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        window.location.href = parsed.href;
        return;
      }
      window.location.reload();
    } catch {
      window.location.reload();
    }
  }, []);

  return { me, loading, signOutUsage };
}
