import { cn } from "@/lib/utils";

/**
 * Arc-reactor brand mark. Pure SVG so it works in RSC; the pulse is CSS
 * (`animate-reactor`) and respects `prefers-reduced-motion`.
 */
export function Reactor({
  className,
  size = 22,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("animate-reactor text-primary", className)}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      <circle cx="12" cy="12" r="6.5" stroke="currentColor" strokeWidth="1.25" opacity="0.7" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i * Math.PI) / 4;
        const x1 = 12 + Math.cos(a) * 6.5;
        const y1 = 12 + Math.sin(a) * 6.5;
        const x2 = 12 + Math.cos(a) * 9.5;
        const y2 = 12 + Math.sin(a) * 9.5;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            opacity="0.55"
          />
        );
      })}
    </svg>
  );
}
