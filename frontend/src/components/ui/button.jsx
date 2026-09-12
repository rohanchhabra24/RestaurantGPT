import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils.js";

// Standard shadcn/ui Button, adapted to this project's variant names and
// re-themed onto the existing dark palette (via the color tokens mapped in
// tailwind.config.js) instead of shadcn's default zinc/slate palette.
const buttonVariants = cva(
  // Explicit reset baseline: Tailwind's preflight (which normally zeroes
  // out the browser's native <button> appearance/border) is disabled
  // project-wide to keep this trial scoped to this page — see
  // tailwind.config.js — so every variant has to start from a clean,
  // borderless, transparent button itself rather than relying on that.
  "appearance-none border-0 bg-transparent p-0 m-0 cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[var(--color-accent-200)]",
        secondary: "bg-surface-raised text-foreground ring-1 ring-inset ring-border hover:ring-[var(--color-neutral-500)]",
        ghost: "text-muted-foreground hover:text-foreground hover:bg-white/5",
        outline: "ring-1 ring-inset ring-border text-foreground hover:ring-[var(--color-neutral-500)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        icon: "h-8 w-8 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";

export { Button, buttonVariants };
