"use client"

import { useState } from "react"
import { AlertTriangle, Check } from "lucide-react"

import type { DepartmentClaim } from "@/lib/api/pm"
import { useDepartmentClaims } from "@/hooks/useReportBuilder"
import { Skeleton } from "@/components/ui/skeletons"

/* What the analysis actually checked, and how each statement came out.
 *
 * "No problems found" on its own is unverifiable — it could equally mean the
 * drafts were clean or that there was nothing to compare. On a real cycle one
 * department recorded 155 facts and another recorded 30, so the PM could not
 * tell from the verdict alone how much had really been examined.
 *
 * Every statement carries its own verdict rather than the panel carrying one
 * for all of them. A single "no problems found" asks to be taken on trust; a
 * list the PM can run their eye down does not.
 *
 * Reads the stored claims, which is a plain database read — no model call, and
 * nothing recalculated. This reports what was checked, never re-checks it. */

const SHOWN = 12

export function WhatWasChecked({ cycleId }: { cycleId: string }) {
  const { data, isLoading } = useDepartmentClaims(cycleId)

  const departments = (data?.departments ?? [])
    .map((dept) => ({ name: dept.department, claims: distinct(dept.claims) }))
    .filter((d) => d.claims.length > 0)

  // A skeleton rather than nothing. Returning null while the claims load left
  // a tall blank gap under the green banner, which reads as "that is all there
  // is" — the opposite of what this panel is for.
  if (isLoading) return <WhatWasCheckedSkeleton />
  if (departments.length === 0) return null

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center gap-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          What we checked
        </p>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="space-y-3">
        {departments.map((dept) => (
          <DepartmentFacts key={dept.name} name={dept.name} claims={dept.claims} />
        ))}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-400">
        Each department&apos;s draft was checked sentence by sentence against
        these statements. Only the company-wide ones are also compared against
        other departments&apos; figures.
      </p>
    </div>
  )
}

function DepartmentFacts({ name, claims }: { name: string; claims: DepartmentClaim[] }) {
  const [all, setAll] = useState(false)
  const shown = all ? claims : claims.slice(0, SHOWN)
  const hidden = claims.length - shown.length
  const disputed = claims.filter((c) => c.dispute).length

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <p className="text-sm font-bold text-[#1A1D2E]">{name}</p>
        <p className="shrink-0 text-xs text-slate-400">
          {claims.length} statement{claims.length === 1 ? "" : "s"}
          {disputed > 0 ? ` · ${disputed} disputed` : " · no issues found"}
        </p>
      </div>

      <ul className="divide-y divide-slate-50">
        {shown.map((claim) => (
          <li
            key={claim.id}
            className="flex items-start justify-between gap-6 px-5 py-2.5"
          >
            <p className="text-sm leading-relaxed text-slate-700">{claim.text}</p>
            <Verdict dispute={claim.dispute} />
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <button
          onClick={() => setAll(true)}
          className="w-full border-t border-slate-100 px-5 py-2.5 text-xs font-semibold text-[#4040c8] hover:bg-indigo-50/50"
        >
          Show {hidden} more
        </button>
      )}
    </div>
  )
}

/* Kept on one line and never wrapped, so the eye can run straight down the
   right-hand edge instead of hunting for each verdict. */
function Verdict({ dispute }: { dispute?: string | null }) {
  if (dispute) {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-amber-700">
        <AlertTriangle className="h-3 w-3 shrink-0" />
        {dispute}
      </span>
    )
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs text-emerald-600">
      <Check className="h-3 w-3 shrink-0" strokeWidth={3} />
      No issue found
    </span>
  )
}

/* Guards against the same sentence being recorded twice — two answers can
   restate one fact, and listing it twice reads as a checking error. */
function distinct(claims: DepartmentClaim[]): DepartmentClaim[] {
  const seen = new Set<string>()
  const out: DepartmentClaim[] = []
  for (const claim of claims) {
    const text = (claim.text ?? "").trim()
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(claim)
  }
  return out
}


/* Shaped like the real panel — a header strip and two department cards — so
   the page does not jump when the data lands. */
function WhatWasCheckedSkeleton() {
  return (
    <div className="w-full">
      <div className="mb-3 flex items-center gap-3">
        <Skeleton className="h-3 w-28" />
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="space-y-3">
        {[0, 1].map((card) => (
          <div
            key={card}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-40" />
            </div>
            <div className="divide-y divide-slate-50">
              {[0, 1, 2, 3].map((row) => (
                <div
                  key={row}
                  className="flex items-center justify-between gap-6 px-5 py-3"
                >
                  {/* Staggered widths so it reads as sentences, not a bar chart. */}
                  <Skeleton
                    className="h-3.5"
                    style={{ width: `${[62, 48, 71, 55][row]}%` }}
                  />
                  <Skeleton className="h-3 w-24 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
