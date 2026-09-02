import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

/**
 * HUD panel = shadcn `Card` + an optional console-style title bar and reticle
 * corners. Purely presentational; wrap any content in it.
 */
export function Panel({
  title,
  icon,
  actions,
  corners = true,
  glow = false,
  bodyClassName,
  className,
  children,
}: {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  corners?: boolean;
  glow?: boolean;
  bodyClassName?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        "gap-0 border-0 bg-card/70 p-0 ring-1 ring-border backdrop-blur-md transition-shadow duration-200 hover:ring-border/80",
        glow && "hud-glow",
        corners && "hud-corners",
        className,
      )}
    >
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-gradient-to-b from-primary/[0.04] to-transparent px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            {icon && <span className="text-primary [&_svg]:size-4">{icon}</span>}
            <span className="truncate font-mono text-[11.5px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
              {title}
            </span>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </Card>
  );
}
