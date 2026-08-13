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
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from "@e-infra/design-system";
import { ModeToggle } from "./ModeToggle";
import { RefreshRateSelector } from "./RefreshRateSelector";
import { HealthIndicator } from "./HealthIndicator";
import { useHealth } from "../hooks/useData";
import { useUsageAuth } from "../hooks/useUsageAuth";
import InfraLogo from "../../public/e-INFRA_logo.svg";
import InfraLogoDark from "../../public/e-INFRA_logo_White.svg";
import { LogOut } from "lucide-react";

export function AppHeader() {
  const { data: health, isError, fetchStatus } = useHealth();
  const isHealthy =
    !isError && fetchStatus !== "paused" && health?.prometheus_healthy === true;
  const { me, loading: usageLoading, signOutUsage } = useUsageAuth();

  const identity = me?.name ?? me?.email ?? me?.identifier ?? null;

  return (
    <Header className="bg-background/50 backdrop-blur supports-backdrop-filter:bg-card/60">
      <HeaderContent className="max-w-7xl">
        <HeaderLeft>
          <Link
            to="/status"
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <div className="flex h-10 items-center justify-center">
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
            <div>
              <H4>CERIT-SC</H4>
              <Muted>LLM Service Monitor</Muted>
            </div>
          </Link>

          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuLink href="/status">Status</NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink href="/usage">Usage</NavigationMenuLink>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </HeaderLeft>
        <HeaderRight className="flex items-center gap-2">
          <HealthIndicator healthy={isHealthy} />
          <RefreshRateSelector />
          <ModeToggle />
          {!usageLoading && identity ? (
            <div className="flex items-center gap-2 border-l pl-2 ml-1">
              <Small
                className="hidden max-w-56 truncate text-text-muted md:inline"
                title={identity}
              >
                {identity}
              </Small>
              <Button variant="outline" size="icon" onClick={signOutUsage}>
                <LogOut />
              </Button>
            </div>
          ) : null}
        </HeaderRight>
      </HeaderContent>
    </Header>
  );
}
