import { AlertTriangle, Check } from "lucide-react"

import type { DepartmentClaim } from "@/lib/api/pm"

/* One fact a department stated, as two short lines of prose rather than a table
   row: the reader is understanding what a department asserted, not scanning
   columns. The second line says in words what a "Scope: Department" cell would
   not — that the figure is never compared against another department.

   Shared by the PM's Department Claims page and the HOD's review screen, so a
   fact reads the same wherever it appears. The verdict line is opt-in via
   `checked`: the HOD's screen has no findings to report, so it passes nothing
   and keeps rendering exactly as it always has. */
export function ClaimLine({
  claim,
  checked,
}: {
  claim: DepartmentClaim
  /** Whether the drafts have been analyzed. Omit to hide the verdict entirely
      — undefined means "this screen does not know", which is not the same as
      "not checked yet". */
  checked?: boolean
}) {
  const isCompany = claim.scope === "company"
  const period = claim.period ? ` for ${claim.period}` : ""
  const context = isCompany
    ? `A company-wide figure${period}.`
    : `A department-level figure${period} — not compared against other departments.`

  return (
    <div>
      <p className="text-sm leading-relaxed text-[#1A1D2E]">{claim.text}</p>
      <p className="mt-0.5 text-xs text-slate-500">{context}</p>
      {checked !== undefined && <Verdict claim={claim} checked={checked} />}
    </div>
  )
}

/* Whether anything disagreed with this fact.

   Three states, and the difference between the last two matters: a fact nobody
   has checked is not a fact nobody disputed. Saying "no issue found" before the
   analysis has run would be a claim we cannot back. */
function Verdict({ claim, checked }: { claim: DepartmentClaim; checked: boolean }) {
  if (!checked) {
    return (
      <p className="mt-1 text-xs text-slate-400">
        Not checked yet — run Analyze to check these facts against the drafts.
      </p>
    )
  }

  if (claim.dispute) {
    return (
      <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-amber-700">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        {claim.dispute}
      </p>
    )
  }

  return (
    <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-700">
      <Check className="h-3 w-3 shrink-0" />
      No issue found
    </p>
  )
}
