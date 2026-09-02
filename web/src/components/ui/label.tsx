import * as React from "react";

import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "font-mono text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase select-none",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
