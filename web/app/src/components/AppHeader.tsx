import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useDrag } from "@use-gesture/react";
import { Link } from "react-router-dom";
import {
  Button,
  Header,
  HeaderContent,
  HeaderLeft,
  HeaderRight,
  H4,
  Muted,
  Small,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Separator,
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from "@e-infra/design-system";
import { ModeToggle, ThemeItems } from "./ModeToggle";
import { RefreshRateSelector, RefreshRateItems } from "./RefreshRateSelector";
import { HealthIndicator } from "./HealthIndicator";
import { useHealth } from "../hooks/useData";
import { useUsageAuth } from "../hooks/useUsageAuth";
import InfraLogo from "../../public/e-INFRA_logo.svg";
import InfraLogoDark from "../../public/e-INFRA_logo_White.svg";
import { LogOut, Menu } from "lucide-react";

const NAV_ITEMS = [
  { to: "/status", label: "Status" },
  { to: "/usage", label: "Usage" },
];

function BrandLink() {
  return (
    <Link
      to="/status"
      className="flex items-center gap-3 hover:opacity-80 transition-opacity"
    >
      <div className="h-10 items-center justify-center shrink-0 flex">
        <img
          className="h-8 w-auto object-contain block dark:hidden"
          src={InfraLogo}
          alt="Logo"
        />
        <img
          className="h-8 w-auto object-contain dark:block hidden"
          src={InfraLogoDark}
          alt="Logo"
        />
      </div>
      <div className="shrink-0">
        <H4>CERIT-SC</H4>
        <Muted>LLM Service Monitor</Muted>
      </div>
    </Link>
  );
}

function HeaderNav() {
  return (
    <NavigationMenu>
      <NavigationMenuList className="gap-2 sm:gap-4">
        <NavigationMenuItem>
          <NavigationMenuLink href="/status">Status</NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink href="/usage">Usage</NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}

function UserBadge({
  identity,
  onSignOut,
}: {
  identity: string;
  onSignOut: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-l pl-2 ml-1">
      <Small
        className="hidden max-w-56 truncate text-text-muted md:inline"
        title={identity}
      >
        {identity}
      </Small>
      <Button variant="outline" size="icon" onClick={onSignOut}>
        <LogOut />
      </Button>
    </div>
  );
}

type DragPhase = "idle" | "drag" | "settle" | "dismiss";

const DISMISS_DISTANCE_PX = 100;
const FLICK_VELOCITY = 0.5; // px per ms
const OPEN_COMMIT_PROGRESS = 0.4;
const FLICK_COMMIT_PROGRESS = 0.6;
const SETTLE_MS = 300;
const DISMISS_CLEANUP_MS = 350;
const SHEET_DRAG_ACTIVATION_PX = 8;
const EDGE_DRAG_ACTIVATION_PX = 10;
const ENTRY_ANIMATION_MS = 550;

function MobileNav({
  isHealthy,
  identity,
  onSignOut,
}: {
  isHealthy: boolean;
  identity: string | null;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [phase, setPhase] = useState<DragPhase>("idle");
  // While a gesture cancelled the entry keyframe, keep it suppressed until
  // close — clearing `animation: none` early would replay the slide-in.
  const [entrySuppressed, setEntrySuppressed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewW = useRef(0);
  const entryLockUntil = useRef(0);
  const dragIgnored = useRef(false);
  const edgeDragging = useRef(false);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const closeSheet = useCallback(() => {
    clearTimer();
    setEntrySuppressed(false);
    setPhase("idle");
    setDragX(0);
    setOpen(false);
  }, [clearTimer]);

  const dismissSheet = useCallback(() => {
    // Preserve current offset so the exit keyframe starts from here.
    clearTimer();
    setEntrySuppressed(false);
    setPhase("dismiss");
    setOpen(false);
    timer.current = setTimeout(
      () => {
        setPhase("idle");
        setDragX(0);
      },
      DISMISS_CLEANUP_MS
    );
  }, [clearTimer]);

  const getSheetStyle = (): CSSProperties | undefined => {
    switch (phase) {
      case "drag":
        return {
          transform: `translateX(${dragX}px)`,
          transition: "none",
          animation: "none",
        };
      case "settle":
        return {
          transform: `translateX(${dragX}px)`,
          transition: `transform ${SETTLE_MS}ms ease-out`,
          animation: "none",
        };
      case "dismiss":
        return { transform: `translateX(${dragX}px)` };
      case "idle":
        return entrySuppressed ? { animation: "none" } : undefined;
    }
  };

  const sheetDrag = useDrag(
    ({ first, last, movement: [mx], velocity: [vx] }) => {
      if (first) {
        // Ignore drags during the entry animation to avoid a position jump.
        if (Date.now() < entryLockUntil.current) {
          dragIgnored.current = true;
          return;
        }
        dragIgnored.current = false;
        clearTimer();
        setEntrySuppressed(true);
        setPhase("drag");
        setDragX(Math.max(0, mx));
      } else if (last) {
        if (dragIgnored.current) {
          dragIgnored.current = false;
          return;
        }
        if (mx > DISMISS_DISTANCE_PX || (vx > FLICK_VELOCITY && mx > 0)) {
          setDragX(Math.max(0, mx));
          dismissSheet();
        } else if (mx > 0) {
          setDragX(0);
          setPhase("settle");
          timer.current = setTimeout(() => setPhase("idle"), SETTLE_MS);
        } else {
          setPhase("idle");
          setDragX(0);
        }
      } else {
        if (dragIgnored.current) return;
        setDragX(Math.max(0, mx));
      }
    },
    {
      axis: "x",
      filterTaps: true,
      activation: { distance: SHEET_DRAG_ACTIVATION_PX },
    }
  );

  const edgeDrag = useDrag(
    ({ first, last, movement: [emx], velocity: [vx] }) => {
      if (first) {
        // Block new edge gestures when the sheet is already open.
        if (open) return;
        edgeDragging.current = true;
        clearTimer();
        viewW.current = window.innerWidth;
        entryLockUntil.current = 0;
        setEntrySuppressed(true);
        setOpen(true);
        setPhase("drag");
        setDragX(Math.min(viewW.current, Math.max(0, viewW.current + emx)));
      } else if (last) {
        if (!edgeDragging.current) return;
        edgeDragging.current = false;
        const w = viewW.current;
        const currentX = Math.min(w, Math.max(0, w + emx));
        const progress = 1 - currentX / w;
        if (
          progress > OPEN_COMMIT_PROGRESS ||
          (vx < -FLICK_VELOCITY && currentX < w * FLICK_COMMIT_PROGRESS)
        ) {
          setDragX(0);
          setPhase("settle");
          timer.current = setTimeout(() => setPhase("idle"), SETTLE_MS);
        } else {
          setDragX(w);
          setPhase("settle");
          timer.current = setTimeout(() => {
            dismissSheet();
          }, SETTLE_MS);
        }
      } else {
        if (!edgeDragging.current) return;
        const w = viewW.current;
        setDragX(Math.min(w, Math.max(0, w + emx)));
      }
    },
    {
      axis: "x",
      filterTaps: true,
      activation: { distance: EDGE_DRAG_ACTIVATION_PX },
    }
  );

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(o) => {
          if (o) {
            entryLockUntil.current = Date.now() + ENTRY_ANIMATION_MS;
            setOpen(true);
          } else if (phase !== "dismiss") {
            closeSheet();
          }
        }}
      >
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="right"
          className="w-full gap-0 p-0 sm:max-w-sm overflow-y-auto touch-pan-y"
          {...sheetDrag()}
          style={getSheetStyle()}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute left-1.5 top-1/2 h-10 w-1 -translate-y-1/2 rounded-full bg-border"
          />
          <SheetHeader className="flex-row items-center justify-between border-b border-border mr-8">
            <SheetTitle>Menu</SheetTitle>
            <HealthIndicator healthy={isHealthy} />
          </SheetHeader>

          <nav className="flex flex-col gap-1 p-4">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={closeSheet}
                className="rounded-md px-3 py-2 text-base font-medium text-text transition-colors hover:bg-secondary hover:text-primary"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Separator />

          <div className="p-4">
            <p className="mb-2 text-sm font-medium text-text-muted">
              Refresh rate
            </p>
            <RefreshRateItems onSelect={closeSheet} />
          </div>

          <Separator />

          <div className="p-4">
            <p className="mb-2 text-sm font-medium text-text-muted">Theme</p>
            <ThemeItems onSelect={closeSheet} />
          </div>

          {identity ? (
            <>
              <Separator />
              <div className="p-4">
                <p className="mb-1 text-sm font-medium text-text-muted">
                  Account
                </p>
                <p className="mb-3 truncate text-sm text-text" title={identity}>
                  {identity}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    onSignOut();
                    closeSheet();
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
      {createPortal(
        <div
          {...edgeDrag()}
          className="fixed inset-y-0 right-0 z-40 w-5 sm:hidden"
          style={{ touchAction: "pan-y" }}
          aria-hidden
        />,
        document.body
      )}
    </>
  );
}

export function AppHeader() {
  const { data: health, isError, fetchStatus } = useHealth();
  const isHealthy =
    !isError && fetchStatus !== "paused" && health?.prometheus_healthy === true;
  const { me, loading: usageLoading, signOutUsage } = useUsageAuth();

  const identity = me?.name ?? me?.email ?? me?.identifier ?? null;

  return (
    <Header className="bg-background/50 backdrop-blur supports-backdrop-filter:bg-surface-raised/60">
      <HeaderContent className="max-w-7xl gap-2 sm:gap-4">
        <HeaderLeft className="gap-2 sm:gap-4">
          <BrandLink />
          <div className="hidden sm:block">
            <HeaderNav />
          </div>
        </HeaderLeft>
        <HeaderRight>
          <HealthIndicator healthy={isHealthy} />
          <div className="hidden items-center gap-2 sm:flex">
            <RefreshRateSelector />
            <ModeToggle />
          </div>
          {!usageLoading && identity ? (
            <div className="hidden sm:flex">
              <UserBadge identity={identity} onSignOut={signOutUsage} />
            </div>
          ) : null}
          <div className="sm:hidden">
            <MobileNav
              isHealthy={isHealthy}
              identity={!usageLoading ? identity : null}
              onSignOut={signOutUsage}
            />
          </div>
        </HeaderRight>
      </HeaderContent>
    </Header>
  );
}
