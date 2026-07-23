import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@e-infra/design-system";

interface UptimeBarProps {
  buckets: boolean[];
  height?: number;
}

export function UptimeBar({ buckets, height = 20 }: UptimeBarProps) {
  // Calculate uptime summary
  const uptime = buckets.filter((b) => b).length;
  const pct =
    buckets.length > 0 ? ((uptime / buckets.length) * 100).toFixed(1) : "0";
  const summaryText = `${pct}% uptime (${uptime}/${buckets.length} intervals)`;

  // Calculate time label for bucket
  const bucketTitle = (i: number, up: boolean): string => {
    const totalMin = buckets.length * 30;
    const minAgo = totalMin - i * 30;
    const h = Math.floor(minAgo / 60);
    const m = minAgo % 60;
    const timeLabel = h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""} ago` : `${m}m ago`;
    return `${timeLabel}: ${up ? "up" : "down"}`;
  };

  return (
    <div>
      <div className="flex items-center gap-px" title={summaryText}>
        {buckets.map((up, i) => (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <div
                className={`flex-1 rounded-sm transition-colors ${
                  up
                    ? "bg-success hover:bg-success-400"
                    : "bg-error-500 hover:bg-error-400"
                }`}
                style={{ height: `${height}px` }}
                title={bucketTitle(i, up)}
              />
            </TooltipTrigger>
            <TooltipContent>{bucketTitle(i, up)}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-text-heading mt-0.5">
        <span>24h ago</span>
        <span>now</span>
      </div>
    </div>
  );
}
