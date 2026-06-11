import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

// Prominent inline warning shown when an uploaded document isn't in the cycle's
// language. Renders nothing when `message` is null, so callers can drop it in
// unconditionally: <LanguageMismatchAlert message={docLangWarning} />.
//
// Styling follows the app's destructive-banner pattern (see pm/cycles/page.tsx).
export function LanguageMismatchAlert({
  message,
  className,
}: {
  message: string | null
  className?: string
}) {
  if (!message) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4",
        "animate-in fade-in slide-in-from-top-1 duration-300",
        className,
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/15">
        <AlertTriangle className="h-4 w-4 text-destructive" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-destructive">
          Wrong document language
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-destructive/90">
          {message}
        </p>
      </div>
    </div>
  )
}
