"use client"

import { Check, Sparkles } from "lucide-react"
import type { BriefTheme } from "@/lib/api/pm"
import { cn } from "@/lib/utils"

/**
 * Read-only + selectable presentation of the brief's initial themes
 * (`initial_themes_and_keywords.themes`). Editing happens on the Strategic Brief
 * step; here the PM only picks which themes carry into the report. Each card
 * shows the title + keyword chips and a selection checkbox.
 */
export function InitialThemesPicker({
  themes,
  selected,
  onToggle,
  isRtl,
}: {
  themes: BriefTheme[]
  /** Titles currently selected. */
  selected: Set<string>
  onToggle: (title: string) => void
  isRtl?: boolean
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Initial Themes
          </span>
          <span className="text-xs text-muted-foreground">
            From your approved strategic brief · select to include
          </span>
        </div>
      </div>

      {themes.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-slate-50 px-4 py-8 text-center">
          <Sparkles className="h-5 w-5 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No initial themes.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {themes.map((theme, i) => {
            const isSelected = selected.has(theme.title)
            return (
              <button
                key={i}
                type="button"
                onClick={() => onToggle(theme.title)}
                aria-pressed={isSelected}
                className={cn(
                  "group rounded-xl border bg-white p-4 text-left shadow-sm transition-all hover:shadow-md",
                  isSelected
                    ? "border-indigo-400 ring-1 ring-indigo-300"
                    : "border-slate-100",
                )}
              >
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
                    {theme.keywords.length > 0 && (
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
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
