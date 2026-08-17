import { useLayoutEffect, useRef, useState } from "react";
import type { UsageTooltipData } from "../lib/chart-config";
import { computeTooltipPosition } from "../lib/chart-config";
import { P, Separator, Small } from "@e-infra/design-system";

/** hover card for the usage bar chart. */
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
      className={`pointer-events-none absolute z-10 grid min-w-32 items-start gap-1.5 rounded-lg border border-border bg-surface-raised p-0 shadow-xl ${
        reducedMotion ? "" : "transition-opacity duration-150"
      } ${position ? "opacity-100" : "opacity-0"}`}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0 }}
    >
      <div className="px-2 pt-2">
        <P>{data.title}</P>
      </div>
      <Separator />
      {data.items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 px-2">
          <span
            className="size-3 shrink-0 rounded-md"
            style={{ backgroundColor: item.color }}
          />
          <Small className="flex-1 text-text-muted">{item.label}</Small>
          <Small className="text-semibold tabular-nums">{item.formatted}</Small>
        </div>
      ))}
      <Separator />
      <div className="px-2 pb-2 flex justify-between">
        <Small className="text-text-muted">Total:</Small>
        <Small className="text-semibold">{data.totalFormatted}</Small>
      </div>
    </div>
  );
}
