import { useLayoutEffect, useRef, useState } from "react";
import type { UsageTooltipData } from "../lib/chart-config";
import { computeTooltipPosition } from "../lib/chart-config";

/** Design-system-styled hover card for the usage bar chart. */
export function UsageChartTooltip({
  data,
  reducedMotion,
}: {
  data: UsageTooltipData;
  reducedMotion: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );

  // Measure before paint so the card never flashes in the wrong spot.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = { width: el.offsetWidth, height: el.offsetHeight };
    setSize((prev) =>
      prev?.width === next.width && prev.height === next.height ? prev : next,
    );
  }, [data]);

  const position = size
    ? computeTooltipPosition(data, size.width, size.height)
    : null;

  return (
    <div
      ref={ref}
      role="tooltip"
      className={`pointer-events-none absolute z-10 grid min-w-32 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl ${
        reducedMotion ? "" : "transition-opacity duration-150"
      } ${position ? "opacity-100" : "opacity-0"}`}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0 }}
    >
      <div className="border-b border-border/50 pb-1 font-medium">
        {data.title}
      </div>
      {data.items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-[2px]"
            style={{ backgroundColor: item.color }}
          />
          <span className="flex-1 text-muted-foreground">{item.label}</span>
          <span className="font-mono font-medium tabular-nums">
            {item.formatted}
          </span>
        </div>
      ))}
      <div className="mt-0.5 border-t border-border/50 pt-1 font-medium">
        Total: {data.totalFormatted}
      </div>
    </div>
  );
}
