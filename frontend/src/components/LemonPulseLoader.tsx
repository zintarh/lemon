import { cn } from "@/lib/utils";

/**
 * Branded loading state — lemon mark with opacity pulse (no circular spinner).
 */
export function LemonPulseLoader({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/lemon-single.png"
      alt=""
      aria-hidden
      className={cn("animate-pulse object-contain select-none", className)}
    />
  );
}
