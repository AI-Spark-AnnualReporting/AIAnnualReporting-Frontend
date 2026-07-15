"use client"

import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Check, Loader2, Lock, ShieldAlert, Sparkles } from "lucide-react"
import { pmApi, type BriefTheme } from "@/lib/api/pm"
import { cn } from "@/lib/utils"

// Legacy themes may miss `keywords`/`selected` — default keywords to [] and
// selected to true (so legacy themes render as checked).
function normalize(list: BriefTheme[]): BriefTheme[] {
  return list.map((t) => ({
    title: t.title,
    keywords: t.keywords ?? [],
    selected: t.selected ?? true,
  }))
}

function serialize(list: BriefTheme[]) {
  return list
    .map((t) => `${t.title}¦${(t.keywords ?? []).join(",")}¦${t.selected !== false}`)
    .join("§")
}

/**
 * Read-only + selectable presentation of the brief's initial themes
 * (`initial_themes_and_keywords.themes`). Title/keywords are edited on the
 * Strategic Brief step; here the PM only toggles each theme's `selected` flag,
 * which persists immediately via `save-brief-and-themes` (the backend injects
 * only checked themes into the section-writing prompt).
 */
export function InitialThemesPicker({
  cycleId,
  themes,
  isRtl,
  readOnly,
}: {
  cycleId: string
  themes: BriefTheme[]
  isRtl?: boolean
  /** Locked plan → view-only (selection shown but not toggleable). */
  readOnly?: boolean
}) {
  const qc = useQueryClient()
  const [list, setList] = useState<BriefTheme[]>(() => normalize(themes))
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")

  // Seed from the server only until the user first toggles — a save's refetch
  // must not clobber a rapid selection change.
  const [touched, setTouched] = useState(false)
  const [seededKey, setSeededKey] = useState(serialize(themes))
  const incomingKey = serialize(themes)
  if (!touched && seededKey !== incomingKey) {
    setSeededKey(incomingKey)
    setList(normalize(themes))
  }

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    },
    [],
  )

  const persist = async (next: BriefTheme[]) => {
    setSaveState("saving")
    try {
      await pmApi.saveBriefAndThemes(cycleId, { themes: next })
      setSaveState("saved")
      qc.invalidateQueries({ queryKey: ["pm", "cycle", cycleId] })
    } catch (err) {
      setSaveState("error")
      toast.error((err as { message?: string })?.message || "Couldn't save your changes.")
    }
  }

  const toggle = (i: number) => {
    const next = list.map((t, idx) =>
      idx === i ? { ...t, selected: t.selected === false } : t,
    )
    setList(next)
    setTouched(true)
    persist(next)
  }

  const selectedCount = list.filter((t) => t.selected !== false).length

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Initial Themes
          </span>
          <span className="text-xs text-muted-foreground">
            From your approved strategic brief · {selectedCount} of {list.length} selected
          </span>
          {!readOnly && <SaveIndicator state={saveState} />}
        </div>
        {readOnly && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
            <Lock className="h-3 w-3" />
            Locked
          </span>
        )}
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-slate-50 px-4 py-8 text-center">
          <Sparkles className="h-5 w-5 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No initial themes.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {list.map((theme, i) => {
            const isSelected = theme.selected !== false
            const cardClass = cn(
              "rounded-xl border bg-white p-4 text-left shadow-sm transition-all",
              !readOnly && "group hover:shadow-md",
              isSelected
                ? "border-indigo-400 ring-1 ring-indigo-300"
                : "border-slate-100",
            )
            const inner = (
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors",
                    isSelected
                      ? "border-indigo-500 bg-indigo-500 text-white"
                      : "border-slate-300 bg-white text-transparent group-hover:border-indigo-300",
                  )}
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
                <div
                  dir={isRtl ? "rtl" : "ltr"}
                  className={cn(
                    "min-w-0 flex-1 space-y-2",
                    isRtl ? "text-right" : "text-left",
                  )}
                >
                  <h4 className="text-sm font-semibold leading-snug text-slate-900">
                    {theme.title || (
                      <span className="italic text-slate-400">Untitled theme</span>
                    )}
                  </h4>
                  {(theme.keywords ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {theme.keywords.map((kw, k) => (
                        <span
                          key={k}
                          className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50/60 px-2.5 py-1 text-xs font-medium text-indigo-700"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
            // Read-only → static card; otherwise a checkbox button.
            return readOnly ? (
              <div key={i} className={cardClass}>
                {inner}
              </div>
            ) : (
              <button
                key={i}
                type="button"
                onClick={() => toggle(i)}
                role="checkbox"
                aria-checked={isSelected}
                className={cardClass}
              >
                {inner}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

/* ── Save status indicator ───────────────────────────────────────────────── */
function SaveIndicator({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "idle") return null
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
      </span>
    )
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600">
        <Check className="h-3.5 w-3.5" /> Saved
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
      <ShieldAlert className="h-3.5 w-3.5" /> Save failed
    </span>
  )
}
