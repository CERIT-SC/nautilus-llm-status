import { Link } from "react-router-dom";
import {
  Header,
  HeaderContent,
  HeaderLeft,
  HeaderRight,
  H4,
  Muted,
} from "@e-infra/design-system";
import { ModeToggle } from "./ModeToggle";
import { RefreshRateSelector } from "./RefreshRateSelector";
import { HealthIndicator } from "./HealthIndicator";
import { useHealth } from "../hooks/useData";
import InfraLogo from "../../public/e-INFRA_logo.svg";
import InfraLogoDark from "../../public/e-INFRA_logo_White.svg";

export function AppHeader() {
  const { data: health, isError, fetchStatus } = useHealth();
  const isHealthy =
    !isError && fetchStatus !== "paused" && health?.prometheus_healthy === true;

  return (
    <Header className="bg-background/50 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <HeaderContent className="max-w-7xl">
        <HeaderLeft>
          <Link
            to="/"
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
        </HeaderLeft>
        <HeaderRight className="flex items-center gap-2">
          <HealthIndicator healthy={isHealthy} />
          <RefreshRateSelector />
          <ModeToggle />
        </HeaderRight>
      </HeaderContent>
    </Header>
  );
}
