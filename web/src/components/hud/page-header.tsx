import { cn } from "@/lib/utils";

/**
 * Consistent page masthead: a mono eyebrow, a big display title, an optional
 * description and a right-aligned actions slot. Used at the top of every route.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-7", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <div className="mb-1.5 flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.22em] text-primary uppercase">
              <span className="inline-block h-1.5 w-1.5 animate-pulse-glow rounded-full bg-primary" />
              <span className="h-px w-5 bg-primary/40" />
              {eyebrow}
            </div>
          )}
          <h1 className="font-heading text-[1.85rem] leading-[1.1] font-bold tracking-[-0.033em] text-glow">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2 pb-0.5">{actions}</div>
        )}
      </div>
      <div className="hud-scanline mt-4 h-px bg-gradient-to-r from-primary/50 via-border to-transparent" />
    </div>
  );
}
