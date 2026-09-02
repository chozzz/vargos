import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("hud-shimmer rounded-lg ring-1 ring-border/60", className)}
      {...props}
    />
  )
}

export { Skeleton }
