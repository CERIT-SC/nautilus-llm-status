import { lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { queryClient } from "./lib/query-client";
import { useConfig } from "./hooks/useData";
import { Announcement } from "./components/AnnouncementBanner";
import { AppHeader } from "./components/AppHeader";
import { SkeletonGrid } from "./components/skeletons/SkeletonGrid";
import { ChartCardSkeleton, StatCardsSkeleton } from "./components/skeletons";
import { DetailPageLayout } from "./components/DetailPageLayout";
import {
  Footer,
  FooterContent,
  FooterLeft,
  FooterLeftText,
  FooterLogo,
  FooterMeta,
  FooterNavHeading,
  FooterNavLink,
  FooterRight,
  Skeleton,
  Card,
  Content,
  ContentHeading,
  ContentBody,
} from "@e-infra/design-system";
import HubLogo from "../public/e-INFRA_logo.svg";
import HubLogoDark from "../public/e-INFRA_logo_White.svg";

const Home = lazy(() =>
  import("./views/Home").then((m) => ({ default: m.Home })),
);
const ModelDetail = lazy(() =>
  import("./views/ModelDetail").then((m) => ({ default: m.ModelDetail })),
);
const EndpointDetails = lazy(() =>
  import("./views/EndpointDetails").then((m) => ({
    default: m.EndpointDetails,
  })),
);
const SuiteDetails = lazy(() =>
  import("./views/SuiteDetails").then((m) => ({ default: m.SuiteDetails })),
);
const Usage = lazy(() => import("./usage").then((m) => ({ default: m.Usage })));

const ANNOUNCEMENT_VARIANT_MAP = {
  outage: "error" as const,
  warning: "warning" as const,
  information: "default" as const,
  operational: "success" as const,
};

function AppContent() {
  const { data: config } = useConfig();

  const announcementMessage = config?.announcement_message;
  const announcementVariant =
    ANNOUNCEMENT_VARIANT_MAP[config?.announcement_type ?? "information"] ??
    "default";

  // No basename: the app owns /status (dashboard) and /usage (usage view) at
  // the origin root, so routes carry their full paths.
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <AppHeader />
        <main className="flex-1">
          {announcementMessage && (
            <div className="container mx-auto px-4 pt-4 max-w-7xl">
              <Announcement
                message={announcementMessage}
                variant={announcementVariant}
              />
            </div>
          )}
          <Routes>
            <Route path="/" element={<Navigate to="/status" replace />} />
            {/* Legacy URL: the old build lived at /status/usage. Serve the
                client-side redirect to /usage (browsers may have cached the old
                301, so this must stay). */}
            <Route
              path="/status/usage"
              element={<Navigate to="/usage" replace />}
            />
            <Route
              path="/status"
              element={
                <Suspense fallback={<HomeSkeleton />}>
                  <Home />
                </Suspense>
              }
            />
            <Route
              path="/status/models/:id"
              element={
                <Suspense fallback={<ModelDetailSkeleton />}>
                  <ModelDetail />
                </Suspense>
              }
            />
            <Route
              path="/status/endpoints/:key"
              element={
                <Suspense fallback={<EndpointDetailsSkeleton />}>
                  <EndpointDetails />
                </Suspense>
              }
            />
            <Route
              path="/status/suites/:key"
              element={
                <Suspense fallback={<SuiteDetailsSkeleton />}>
                  <SuiteDetails />
                </Suspense>
              }
            />
            <Route
              path="/usage"
              element={
                <Suspense
                  fallback={
                    <Content className="container mx-auto px-4 pt-8">
                      <ContentBody>
                        <Skeleton className="h-9 w-64 mb-6" />
                        <Skeleton className="h-16 w-full mb-6" />
                        <StatCardsSkeleton count={5} />
                        <ChartCardSkeleton className="mt-6" />
                        <Skeleton className="h-56 w-full mt-6" />
                      </ContentBody>
                    </Content>
                  }
                >
                  <Usage />
                </Suspense>
              }
            />
            <Route path="*" element={<Navigate to="/status" replace />} />
          </Routes>
        </main>
        <Footer>
          <FooterContent>
            <FooterLeft>
              <FooterLogo>
                <img
                  src={HubLogo}
                  alt="e-INFRA Logo (light mode)"
                  width={120}
                  height={16}
                  className="h-16 w-auto dark:hidden"
                />
                <img
                  src={HubLogoDark}
                  alt="e-INFRA Logo (dark mode)"
                  width={120}
                  height={16}
                  className="hidden h-16 w-auto dark:block"
                />
              </FooterLogo>

              <FooterLeftText className="text-sm text-text-muted">
                The national Czech e-infrastructure for research and
                development. <br></br>LLM Service Monitor operated by CERIT-SC,
                ICS MUNI.
              </FooterLeftText>
            </FooterLeft>
            <FooterRight>
              <nav className="flex flex-col gap-2">
                <FooterNavHeading>Resources</FooterNavHeading>
                <FooterNavLink
                  href="https://docs.e-infra.cz/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  e-INFRA Docs
                </FooterNavLink>
                <FooterNavLink
                  href="https://blog.e-infra.cz/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  e-INFRA Blog
                </FooterNavLink>
              </nav>
              <nav className="flex flex-col gap-2">
                <FooterNavHeading>Legal</FooterNavHeading>
                <FooterNavLink
                  href="https://www.e-infra.cz/en/personal-data-processing"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Privacy Policy
                </FooterNavLink>
              </nav>
            </FooterRight>
          </FooterContent>
          <FooterMeta
            copyright={`Copyright © ${new Date().getFullYear().toString()} e-INFRA CZ`}
          />
        </Footer>
      </div>
    </BrowserRouter>
  );
}

function HomeSkeleton() {
  return (
    <Content className="container mx-auto px-4 pt-8">
      <ContentHeading>LLM Models</ContentHeading>
      <ContentBody>
        <SkeletonGrid count={6} />
        <SkeletonGrid count={2} />
        <SkeletonGrid count={0} showHeader={true} />
      </ContentBody>
    </Content>
  );
}

function ModelDetailSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <Skeleton className="h-4 w-20 mb-6" />
      <div className="flex items-start justify-between mb-6">
        <div>
          <Skeleton className="h-9 w-64 mb-2" />
          <Skeleton className="h-5 w-48" />
        </div>
        <Skeleton className="h-3 w-3 rounded-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card className="py-2" key={i}>
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-7 w-28" />
          </Card>
        ))}
      </div>
      <div className="flex items-center gap-2 mb-6">
        <Skeleton className="h-4 w-20" />
        <div className="flex gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-10 rounded-md" />
          ))}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <ChartCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

function EndpointDetailsSkeleton() {
  return <DetailPageLayout title="Loading..." subtitle="" loading />;
}

function SuiteDetailsSkeleton() {
  return <DetailPageLayout title="Loading..." subtitle="" loading />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;
