import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

type SpinnerProps = React.ComponentProps<typeof Loader2>

/**
 * Bare loading circle. Defaults to a muted, medium spinner — override size and
 * color via `className` (e.g. `className="h-4 w-4 text-primary"`).
 */
export function Spinner({ className, ...props }: SpinnerProps) {
  return (
    <Loader2
      className={cn("h-5 w-5 animate-spin text-muted-foreground", className)}
      aria-hidden="true"
      {...props}
    />
  )
}

/**
 * Centered loading state — the standard "show a circle until the data is ready"
 * block. Fills its container by default; pass `fullScreen` for route/auth gates.
 */
export function PageLoader({
  className,
  label,
  fullScreen = false,
}: {
  className?: string
  label?: string
  fullScreen?: boolean
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "flex w-full flex-col items-center justify-center gap-3",
        fullScreen ? "min-h-screen" : "min-h-[60vh]",
        className
      )}
    >
      <Spinner className="h-8 w-8 text-primary" />
      {label ? (
        <p className="text-sm text-muted-foreground">{label}</p>
      ) : (
        <span className="sr-only">Loading…</span>
      )}
    </div>
  )
}
