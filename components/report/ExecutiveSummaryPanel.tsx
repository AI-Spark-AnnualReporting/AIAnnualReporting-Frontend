"use client"

import { Sparkles } from "lucide-react"
import { SECTION_MODES } from "@/lib/constants"
import { cn } from "@/lib/utils"

/**
 * The Executive Summary is written at assembly time from the finished sections
 * and has no row in `cycle_report_sections` — so it appears in the builder rail
 * as a synthetic, frontend-only entry rather than a faked `CycleReportSection`.
 * A real row would drag in readiness, the locked counter, lock/unlock
 * affordances and a `mode` that means nothing for something nobody can edit.
 *
 * The code is deliberately un-DB-like so it can never collide with a section
 * the backend sends (it reserves `executive_summary` / `exec_summary`).
 */
export const EXECUTIVE_SUMMARY_CODE = "__executive_summary__"
export const EXECUTIVE_SUMMARY_TITLE = "Executive Summary"

/**
 * Read-only rail panel. Explains the summary — it deliberately does NOT show
 * the generated text, which lives on the report preview page. Shares its shape
 * and voice with `AutoSection` in SectionDetail.tsx.
 */
export function ExecutiveSummaryPanel() {
  const mode = SECTION_MODES.auto
  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Same header shape as SectionHeader, minus the per-section chips a
          synthetic entry has no values for (layer, content source). */}
      <div className="shrink-0 px-8 pb-4 pt-6">
        <div className="mb-3 flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
              mode.color,
            )}
          >
            {mode.label}
          </span>
          <span className="text-xs text-slate-400">Written at assembly</span>
        </div>
        <h2 className="text-xl font-bold leading-tight text-slate-900">
          {EXECUTIVE_SUMMARY_TITLE}
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-8 py-6">
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Sparkles className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="mb-1.5 text-sm font-medium">
              Written when the report is assembled
            </p>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              The executive summary opens the report, drawn from your finished
              sections. It is written each time you assemble and you read it on
              the report itself — nothing to do here.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
