"use client"

import { useState } from "react"

import { useDepartmentClaims } from "@/hooks/useReportBuilder"

/* Which figures the analysis actually looked at.
 *
 * "No problems found" on its own is unverifiable — it could equally mean the
 * drafts were clean or that there was nothing to compare. On a real cycle one
 * department contributed 112 figures and another contributed 3, so a conflict
 * was never likely; the PM could not tell that from the verdict alone.
 *
 * Reads the stored claims, which is a plain database read — no model call, and
 * nothing recalculated. This shows what was checked, never re-checks it. */

const SHOWN = 6

export function WhatWasChecked({ cycleId }: { cycleId: string }) {
  const { data } = useDepartmentClaims(cycleId)

  const departments = (data?.departments ?? [])
    .map((dept) => ({
      name: dept.department,
      // Only company-wide figures are ever compared between departments, so
      // those are the only ones this list can honestly claim were compared.
      metrics: distinctMetrics(
        dept.claims.filter((c) => c.scope === "company" && c.metric),
      ),
    }))
    .filter((d) => d.metrics.length > 0)

  if (departments.length === 0) return null

  return (
    <div className="mx-auto mt-10 max-w-xl text-left">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        Figures we checked
      </p>
      <div className="mt-3 space-y-4">
        {departments.map((dept) => (
          <DepartmentMetrics key={dept.name} name={dept.name} metrics={dept.metrics} />
        ))}
      </div>
    </div>
  )
}

function DepartmentMetrics({ name, metrics }: { name: string; metrics: string[] }) {
  const [all, setAll] = useState(false)
  const shown = all ? metrics : metrics.slice(0, SHOWN)
  const hidden = metrics.length - shown.length

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-sm font-semibold text-[#1A1D2E]">{name}</p>
      <ul className="mt-1.5 space-y-0.5">
        {shown.map((m) => (
          <li key={m} className="text-xs text-slate-500">
            {m}
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          onClick={() => setAll(true)}
          className="mt-1.5 text-xs font-semibold text-[#4040c8] hover:underline"
        >
          … and {hidden} more
        </button>
      )}
    </div>
  )
}

/* One entry per measure, not per fact. A department that reported headcount for
   three years states three facts about one measure, and listing it three times
   would pad the list without telling the reader anything. */
function distinctMetrics(claims: { metric?: string | null }[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const claim of claims) {
    const metric = (claim.metric ?? "").trim()
    if (!metric) continue
    const key = metric.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(metric)
  }
  return out
}
