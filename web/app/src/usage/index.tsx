import { useEffect, useState } from "react";
import { ServerOff } from "lucide-react";
import {
  Content,
  ContentBody,
  H3,
  Muted,
  Skeleton,
} from "@e-infra/design-system";
import { useUsageMe } from "../hooks/useUsage";
import { UsageNotLinked, UsageSignIn } from "./UsageAuth";
import { UsageDashboard } from "./UsageDashboard";
import { StatCardsSkeleton, ChartCardSkeleton } from "../components/skeletons";

const GENERIC_AUTH_ERROR =
  "Sign-in did not complete. Try again, or contact support if it persists.";

const AUTH_ERRORS: Record<string, string> = {
  access_denied: "Sign-in was cancelled at the identity provider.",
  missing_sub: "The identity provider did not return a subject identifier.",
  oidc_unavailable:
    "The identity provider could not be reached. Try again in a moment.",
};

/** Read an auth_error code from the URL (set by the OIDC callback redirect). Pure. */
function readAuthError(): string | null {
  const code = new URLSearchParams(window.location.search).get("auth_error");
  if (!code) return null;
  // Only render our own copy for a code we recognise. Echoing the parameter
  // would let a crafted link put arbitrary text on a trusted screen.
  return AUTH_ERRORS[code] ?? GENERIC_AUTH_ERROR;
}

export function Usage() {
  const { data: me, isLoading, isError } = useUsageMe();
  // Read the one-shot auth_error from the URL (set by the OIDC callback redirect).
  const [authError] = useState<string | null>(readAuthError);
  // Strip the consumed code from the URL so a reload doesn't resurface it.
  useEffect(() => {
    if (authError !== null) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [authError]);

  if (isLoading) {
    return (
      <Content className="container mx-auto px-4 pt-8">
        <ContentBody>
          <div
            className="grid gap-6"
            aria-busy="true"
            aria-label="Loading your usage"
          >
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-16 w-full" />
            <StatCardsSkeleton count={5} />
            <ChartCardSkeleton />
            <Skeleton className="h-56 w-full" />
          </div>
        </ContentBody>
      </Content>
    );
  }

  if (isError) {
    return (
      <Content className="container mx-auto px-4 pt-8">
        <ContentBody>
          <div className="text-center py-20">
            <ServerOff className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <H3 className="mb-2">Cannot reach the usage API</H3>
            <Muted>Unable to read your usage data right now.</Muted>
          </div>
        </ContentBody>
      </Content>
    );
  }

  if (!me) {
    return (
      <Content className="container mx-auto px-4 pt-8 place-content-center">
        <ContentBody className="place-content-center">
          <UsageSignIn message={authError} />
        </ContentBody>
      </Content>
    );
  }

  if (!me.linked) {
    return <UsageNotLinked me={me} />;
  }

  return <UsageDashboard />;
}
