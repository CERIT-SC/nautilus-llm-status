import { useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
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

export function RefreshRateItems({ onSelect }: { onSelect?: () => void }) {
  const refreshInterval = useUIStore((s) => s.refreshInterval);
  const setRefreshInterval = useUIStore((s) => s.setRefreshInterval);

  return (
    <div className="flex flex-col gap-1">
      {REFRESH_INTERVALS.map((i) => (
        <Button
          key={i.value}
          variant={refreshInterval === i.value ? "secondary" : "ghost"}
          size="sm"
          className="w-full justify-start"
          onClick={() => {
            setRefreshInterval(i.value);
            onSelect?.();
          }}
        >
          {i.label}
        </Button>
      ))}
    </div>
  );
}

export function RefreshRateSelector() {
  const [open, setOpen] = useState(false);
  const refreshInterval = useUIStore((s) => s.refreshInterval);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label="Select refresh rate">
          <RefreshCw className="h-4 w-4 mr-0 md:mr-2" />
          <span className="hidden md:block">
            {REFRESH_INTERVALS.find((i) => i.value === refreshInterval)
              ?.label || "5m"}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <RefreshRateItems onSelect={() => setOpen(false)} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
