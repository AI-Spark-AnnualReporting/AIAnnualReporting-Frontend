import type { DepartmentClaim } from "@/lib/api/pm"

/* One fact a department stated, as two short lines of prose rather than a table
   row: the reader is understanding what a department asserted, not scanning
   columns. The second line says in words what a "Scope: Department" cell would
   not — that the figure is never compared against another department.

   Shared by the PM's Department Claims page and the HOD's review screen, so a
   fact reads the same wherever it appears.

   No verdict here, deliberately. A tick against a department-level fact could
   only ever say "no issue", since those are never compared between
   departments — a result that carries no information. Findings live on the
   findings page, where they can be acted on. */
export function ClaimLine({ claim }: { claim: DepartmentClaim }) {
  const isCompany = claim.scope === "company"
  const period = claim.period ? ` for ${claim.period}` : ""
  const context = isCompany
    ? `A company-wide figure${period}.`
    : `A department-level figure${period} — not compared against other departments.`

  return (
    <div>
      <p className="text-sm leading-relaxed text-[#1A1D2E]">{claim.text}</p>
      <p className="mt-0.5 text-xs text-slate-500">{context}</p>
    </div>
  )
}
