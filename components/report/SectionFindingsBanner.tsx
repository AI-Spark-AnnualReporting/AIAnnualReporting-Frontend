"use client"

import Link from "next/link"
import { AlertTriangle } from "lucide-react"

/* What the last validation found in the section open on the Build page.
 *
 * `suggestion` is the instruction the PM came with from a Fix button: it leads
 * the banner, with the section's other findings listed under it as "Also in
 * this section". Opened from the rail, the banner lists every finding. */
export function SectionFindingsBanner({
  cycleId,
  findings,
  suggestion,
  isSummary = false,
}: {
  cycleId: string
  /** One line per finding in this section. */
  findings: string[]
  /** The instruction from the Fix button, when the PM arrived through one. */
  suggestion?: string | null
  /** The Executive Summary, which is fixed by re-assembling, not by editing. */
  isSummary?: boolean
}) {
  if (findings.length === 0 && !suggestion) return null

  return (
    <div className="shrink-0 border-b border-amber-200 bg-amber-50/60 px-5 py-2.5">
      <div className="flex flex-wrap items-start gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          {suggestion ? (
            <p className="text-xs leading-snug text-slate-700">
              <span className="font-bold text-[#1A1D2E]">Fixing:</span> {suggestion}
            </p>
          ) : (
            <p className="text-xs font-bold text-[#1A1D2E]">
              {findings.length} validation finding{findings.length === 1 ? "" : "s"} in this section
            </p>
          )}
          {suggestion && findings.length > 0 && (
            <p className="mt-1 text-[11px] font-semibold text-slate-500">
              Also in this section:
            </p>
          )}
          {findings.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-snug text-slate-600">
              {findings.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
          {isSummary && (
            <p className="mt-1 text-[11px] text-slate-500">
              The Executive Summary is rewritten when you re-assemble. Fix the
              sections it is written from instead.
            </p>
          )}
        </div>
        <Link
          href={`/pm/cycles/${cycleId}/validation`}
          className="shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          Back to validation
        </Link>
      </div>
    </div>
  )
}
