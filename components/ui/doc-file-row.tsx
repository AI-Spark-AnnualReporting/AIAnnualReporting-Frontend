import { AlertTriangle, CheckCircle2, FileText, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { DocLang } from "@/hooks/useDocLanguageCheck"

// One pending document row, coloured by its language-check status:
//   bad      → red (wrong language)
//   ok       → green (correct language)
//   checking → neutral while the check is in flight
export function DocFileRow({
  name,
  sizeKB,
  lang,
  onRemove,
}: {
  name: string
  sizeKB: number
  lang: DocLang
  onRemove: () => void
}) {
  const tone = {
    checking: { box: "border bg-card", text: "text-foreground", sub: "text-muted-foreground" },
    ok: { box: "border bg-card", text: "text-foreground", sub: "text-muted-foreground" },
    bad: {
      box: "border-destructive/40 bg-destructive/10",
      text: "text-destructive",
      sub: "text-destructive/80",
    },
  }[lang]

  const Icon = lang === "ok" ? CheckCircle2 : lang === "bad" ? AlertTriangle : FileText

  return (
    <div className={cn("flex items-center gap-3 rounded-lg border p-2.5", tone.box)}>
      {lang === "checking" ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            lang === "ok" ? "text-green-600 dark:text-green-400" : "text-destructive",
          )}
        />
      )}
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium", tone.text)}>{name}</p>
        <p className={cn("text-xs", tone.sub)}>
          {lang === "checking"
            ? "Checking language…"
            : lang === "bad"
              ? `${sizeKB.toFixed(1)} KB · wrong language`
              : `${sizeKB.toFixed(1)} KB`}
        </p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
