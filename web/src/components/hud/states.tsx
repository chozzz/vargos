import { cn } from "@/lib/utils";
import { TriangleAlert, Inbox } from "lucide-react";

/** Consistent inline error card — used by every route's catch branch. */
export function SectionError({
  title = "Signal lost",
  message,
  className,
}: {
  title?: string;
  message: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive",
        className,
      )}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <div>
        <div className="font-medium">{title}</div>
        <div className="mt-0.5 font-mono text-[12px] break-all opacity-90">{message}</div>
      </div>
    </div>
  );
}

/** Consistent empty state for lists that came back with nothing. */
export function EmptyState({
  message,
  icon,
  className,
}: {
  message: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground",
        className,
      )}
    >
      <span className="text-muted-foreground/60 [&_svg]:size-6">
        {icon ?? <Inbox />}
      </span>
      {message}
    </div>
  );
}
