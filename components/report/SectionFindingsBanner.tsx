"use client"

import Link from "next/link"
import { AlertTriangle, ArrowLeft, Check, ChevronsRight } from "lucide-react"

import { isFixedFinding } from "@/lib/validation-fixes"

/* What the last validation found in the section open on the Build page, as a
 * card on the right of the section text.
 *
 * `suggestion` is the instruction the PM came with from a Fix button: it leads
 * the card in its own white box, so it stands out, with the section's other
 * findings listed under it, smaller, as "Also in this section" (the one being
 * fixed is left out of that list). Opened from the rail, the card lists every
 * finding.
 *
 * `fixed` turns the "You're fixing" box green once the section was changed
 * since the check; the next validation confirms it.
 *
 * The page keeps one side open at a time: when the section list is open, this
 * card is `folded` into a thin strip, and clicking the strip opens it again. */
export function SectionFindingsBanner({
  cycleId,
  findings,
  suggestion,
  fixed = false,
  isSummary = false,
  folded = false,
  onToggle,
}: {
  cycleId: string
  /** One line per finding in this section. */
  findings: string[]
  /** The instruction from the Fix button, when the PM arrived through one. */
  suggestion?: string | null
  /** The fix was made: the section changed since the check. */
  fixed?: boolean
  /** The Executive Summary, which is fixed by re-assembling, not by editing. */
  isSummary?: boolean
  /** Shown as a thin strip, because the section list is open. */
  folded?: boolean
  /** Opens the folded card, or folds the open one. */
  onToggle: () => void
}) {
  if (findings.length === 0 && !suggestion) return null

  const others = suggestion
    ? findings.filter((line) => !isFixedFinding(line, suggestion))
    : findings
  const count = others.length + (suggestion && !fixed ? 1 : 0)
  const countText = `${count} problem${count === 1 ? "" : "s"}`
  let stripText = countText
  if (fixed) stripText = count > 0 ? `✓ Fixed · ${countText} left` : "✓ Fixed"
  else if (suggestion) stripText = `You're fixing · ${countText}`

  if (folded) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title="Open the validation card"
        className="flex w-[52px] shrink-0 flex-col items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 py-3 text-amber-700 shadow-sm transition-colors hover:bg-amber-100"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="text-xs font-semibold [writing-mode:vertical-rl]">
          {stripText}
        </span>
      </button>
    )
  }

  return (
    <div className="flex w-[300px] shrink-0 flex-col overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/60 shadow-sm">
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-3">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
        <span className="flex-1 text-sm font-bold text-[#1A1D2E]">Validation</span>
        <button
          type="button"
          onClick={onToggle}
          title="Fold this card"
          aria-label="Fold this card"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-200 bg-white text-slate-500 hover:bg-slate-50"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        {suggestion && fixed ? (
          <div className="rounded-lg border border-emerald-200 border-l-4 border-l-emerald-600 bg-emerald-50 px-3 py-2 shadow-sm">
            <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
              Fixed
            </p>
            <p className="mt-0.5 text-sm leading-snug text-slate-500">{suggestion}</p>
            <p className="mt-1 text-[11px] font-semibold text-emerald-700">
              Validate again to confirm.
            </p>
          </div>
        ) : suggestion ? (
          <div className="rounded-lg border border-indigo-200 border-l-4 border-l-indigo-600 bg-white px-3 py-2 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-600">
              You&apos;re fixing
            </p>
            <p className="mt-0.5 text-sm leading-snug text-[#1A1D2E]">{suggestion}</p>
          </div>
        ) : (
          <p className="text-xs font-bold text-[#1A1D2E]">
            {findings.length} validation finding{findings.length === 1 ? "" : "s"} in this section
          </p>
        )}
        {suggestion && others.length > 0 && (
          <p className="mt-3 text-[11px] font-semibold text-slate-400">
            Also in this section:
          </p>
        )}
        {others.length > 0 && (
          <ul
            className={`mt-1 list-disc space-y-1 pl-4 leading-snug ${
              suggestion ? "text-[11px] text-slate-500" : "text-xs text-slate-600"
            }`}
          >
            {others.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
        {isSummary && (
          <p className="mt-2 text-[11px] text-slate-500">
            The Executive Summary is rewritten when you re-assemble. Fix the
            sections it is written from instead.
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-amber-200 p-3">
        <Link
          href={`/pm/cycles/${cycleId}/validation`}
          className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to validation
        </Link>
      </div>
    </div>
  )
}
