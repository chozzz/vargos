import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { StatusDot } from "@/components/hud/status-dot";

type Tone = "online" | "offline" | "idle" | "warn";

/**
 * Metric tile for dashboards. Mono label + big display value + hint, a glowing
 * left accent and an optional status dot. Lifts and brightens on hover.
 */
export function StatTile({
  label,
  value,
  hint,
  icon,
  status,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  status?: Tone;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "group relative gap-0 overflow-hidden border-0 bg-card/70 p-4 ring-1 ring-border backdrop-blur-md",
        "transition-[transform,box-shadow,--tw-ring-color] duration-200",
        "hover:-translate-y-0.5 hover:ring-primary/50 hover:hud-glow-sm",
        className,
      )}
    >
      {/* left accent — grows and lights up on hover */}
      <span className="absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-primary/40 via-primary/70 to-primary/30 transition-all group-hover:w-1" />
      {/* faint corner bloom */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-primary/10 opacity-0 blur-xl transition-opacity group-hover:opacity-100"
      />
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 font-mono text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
          {icon && <span className="text-primary/80 [&_svg]:size-3.5">{icon}</span>}
          {label}
        </div>
        {status && <StatusDot tone={status} pulse={status === "online"} />}
      </div>
      <div className="mt-2.5 font-heading text-[1.7rem] leading-none font-bold tracking-[-0.025em] tabular-nums text-glow-soft">
        {value}
      </div>
      {hint && (
        <div className="mt-1.5 truncate font-mono text-[11px] text-muted-foreground/90">
          {hint}
        </div>
      )}
    </Card>
  );
}
