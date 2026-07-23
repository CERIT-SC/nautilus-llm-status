import { RefreshCw } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@e-infra/design-system";
import { useUIStore } from "../stores/ui-store";

interface RefreshInterval {
  value: string;
  label: string;
}

const REFRESH_INTERVALS: RefreshInterval[] = [
  { value: "10", label: "10s" },
  { value: "30", label: "30s" },
  { value: "60", label: "1m" },
  { value: "120", label: "2m" },
  { value: "300", label: "5m" },
  { value: "600", label: "10m" },
];

export function RefreshRateSelector() {
  const refreshInterval = useUIStore((s) => s.refreshInterval);
  const setRefreshInterval = useUIStore((s) => s.setRefreshInterval);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label="Select refresh rate">
          <RefreshCw className="h-4 w-4 mr-2" />
          {REFRESH_INTERVALS.find((i) => i.value === refreshInterval)?.label || "5m"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {REFRESH_INTERVALS.map((i) => (
          <DropdownMenuItem
            key={i.value}
            onClick={() => setRefreshInterval(i.value)}
          >
            {i.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
