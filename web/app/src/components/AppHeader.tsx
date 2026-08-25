import { useState } from "react";
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
      <div className="h-10 items-center justify-center shrink-0 hidden sm:flex">
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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="flex-row items-center justify-between border-b border-border mr-8">
          <SheetTitle>Menu</SheetTitle>
          <HealthIndicator healthy={isHealthy} />
        </SheetHeader>

        <nav className="flex flex-col gap-1 p-4">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
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
          <RefreshRateItems onSelect={() => setOpen(false)} />
        </div>

        <Separator />

        <div className="p-4">
          <p className="mb-2 text-sm font-medium text-text-muted">
            Theme
          </p>
          <ThemeItems onSelect={() => setOpen(false)} />
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
                  setOpen(false);
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
