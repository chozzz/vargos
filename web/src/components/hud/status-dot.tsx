import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type Tone = "online" | "offline" | "idle" | "warn";

const TONE: Record<Tone, string> = {
  online: "bg-success",
  offline: "bg-destructive",
  idle: "bg-muted-foreground",
  warn: "bg-warning",
};

/** Small pulsing telemetry dot. Reused everywhere a live/offline state is shown. */
export function StatusDot({
  tone = "idle",
  pulse,
  className,
}: {
  tone?: Tone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex h-2 w-2 shrink-0", className)}>
      {pulse && tone === "online" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
      )}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", TONE[tone])} />
    </span>
  );
}

/** Dot + label pill. `live` maps to online/offline; pass `tone` to override. */
export function LiveBadge({
  live,
  tone,
  labelOn = "Live",
  labelOff = "Offline",
  className,
}: {
  live: boolean;
  tone?: Tone;
  labelOn?: string;
  labelOff?: string;
  className?: string;
}) {
  const resolved: Tone = tone ?? (live ? "online" : "offline");
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 border-border/70 bg-card/60 font-mono text-[11px] tracking-wide uppercase",
        className,
      )}
    >
      <StatusDot tone={resolved} pulse={resolved === "online"} />
      {live ? labelOn : labelOff}
    </Badge>
  );
}
