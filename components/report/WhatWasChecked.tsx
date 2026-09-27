"use client"

import { useState } from "react"

import { useDepartmentClaims } from "@/hooks/useReportBuilder"

/* Which figures the analysis actually looked at.
 *
 * "No problems found" on its own is unverifiable — it could equally mean the
 * drafts were clean or that there was nothing to compare. On a real cycle one
 * department contributed 112 company-wide figures and another contributed 3,
 * so a conflict was never likely; the PM could not tell that from the verdict.
 *
 * Reads the stored claims, which is a plain database read — no model call, and
 * nothing recalculated. This reports what was checked, never re-checks it. */

const SHOWN = 8

export function WhatWasChecked({ cycleId }: { cycleId: string }) {
  const { data } = useDepartmentClaims(cycleId)

  const departments = (data?.departments ?? [])
    .map((dept) => ({
      name: dept.department,
      // Only company-wide figures are ever compared between departments, so
      // those are the only ones this can honestly claim were compared.
      metrics: distinctMetrics(
        dept.claims.filter((c) => c.scope === "company" && c.metric),
      ),
    }))
    .filter((d) => d.metrics.length > 0)

  if (departments.length === 0) return null

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-3 flex items-center gap-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Figures we checked
        </p>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {departments.map((dept) => (
          <DepartmentMetrics key={dept.name} name={dept.name} metrics={dept.metrics} />
        ))}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-slate-400">
        Only company-wide figures are compared between departments. Each
        department&apos;s draft was also checked, sentence by sentence, against
        its own recorded facts.
      </p>
    </div>
  )
}

function DepartmentMetrics({ name, metrics }: { name: string; metrics: string[] }) {
  const [all, setAll] = useState(false)
  const shown = all ? metrics : metrics.slice(0, SHOWN)
  const hidden = metrics.length - shown.length

  return (
    <div className="px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-bold text-[#1A1D2E]">{name}</p>
        <p className="shrink-0 text-xs text-slate-400">
          {metrics.length} figure{metrics.length === 1 ? "" : "s"}
        </p>
      </div>

      {/* Chips rather than a list: these are short labels, and a wrapped row
          fits far more of them on screen than one line each. */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {shown.map((m) => (
          <span
            key={m}
            className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600"
          >
            {m}
          </span>
        ))}
        {hidden > 0 && (
          <button
            onClick={() => setAll(true)}
            className="rounded-md px-2 py-1 text-xs font-semibold text-[#4040c8] hover:bg-indigo-50"
          >
            +{hidden} more
          </button>
        )}
      </div>
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
