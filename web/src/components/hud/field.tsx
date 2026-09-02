import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/** Label + control + optional hint, stacked. The building block for every form. */
export function Field({
  label,
  hint,
  htmlFor,
  className,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

/** Inline label + control (for switches / checkboxes). */
export function FieldRow({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 rounded-lg border border-border/60 px-3 py-2.5", className)}>
      <div className="min-w-0">
        <Label className="normal-case tracking-normal text-foreground">{label}</Label>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground/80">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
