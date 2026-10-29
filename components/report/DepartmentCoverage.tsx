"use client"

import { AlertCircle } from "lucide-react"
import type { FeederMapEntry } from "@/types"
import type { FeederDepartment } from "./FeederPicker"

interface DepartmentCoverageProps {
  departments: FeederDepartment[]
  feeders: FeederMapEntry[]
  isRtl?: boolean
}

// Which departments are feeding the report and which are still spare.
//
// Every section card answers "who feeds THIS section". Nobody answered the
// inverse: a department that submitted and was approved but never got ticked
// anywhere contributes nothing, and with ten departments that goes unnoticed
// until the report reads thin.
//
// Counts come from the feeder map rather than section.feeders because the cards
// below resolve their own pills from it ("the feeder map's mode is the
// authority, the sections list can lag a mode switch") — reading the same source
// keeps this strip from ever contradicting the pills directly underneath it.
//
// Extract sections are excluded. The plan build assigns feeders to them (the
// Router runs over generate, extract and analyze alike), but nothing ever reads
// them back: an extract section's content comes from its uploaded document, and
// _feeder_session_blocks is only reached from the analyze path. Counting those
// would report a department as used when its submitted content never actually
// reaches the report — the exact mistake this strip exists to catch.
const CONSUMES_FEEDERS: ReadonlySet<string> = new Set(["generate", "analyze"])

export function DepartmentCoverage({
  departments,
  feeders,
  isRtl,
}: DepartmentCoverageProps) {
  if (departments.length === 0) return null

  const useCount = new Map<string, number>()
  for (const entry of feeders) {
    // Older plan responses may omit mode; treat those as counting.
    if (entry.mode && !CONSUMES_FEEDERS.has(entry.mode)) continue
    for (const code of entry.departments) {
      useCount.set(code, (useCount.get(code) ?? 0) + 1)
    }
  }

  const unused = departments.filter((d) => !useCount.get(d.department_code))
  const used = departments.filter((d) => useCount.get(d.department_code))

  return (
    <section className="rounded-xl border border-slate-100 bg-white px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Department coverage
        </h3>
        {unused.length > 0 && (
          <span className="shrink-0 text-xs tabular-nums text-amber-700">
            {unused.length} not used
          </span>
        )}
      </div>

      {/* dir on the chip row so it mirrors as a whole for Arabic, matching how
          SectionTile mirrors its own badge row. */}
      <div
        dir={isRtl ? "rtl" : "ltr"}
        className="mt-2 flex flex-wrap items-center gap-1.5"
      >
        {/* Unused first — that is the question this strip exists to answer. */}
        {unused.map((d) => (
          <span
            key={d.department_code}
            className="inline-flex items-center gap-1 rounded-sm bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700"
          >
            <AlertCircle className="h-3 w-3" />
            {d.department_name}
          </span>
        ))}

        {used.map((d) => (
          <span
            key={d.department_code}
            className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground"
          >
            {d.department_name}
            <span className="tabular-nums text-muted-foreground">
              {useCount.get(d.department_code)}
            </span>
          </span>
        ))}
      </div>

      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {unused.length === 0
          ? "Every department feeds at least one AI-written or analyzed section."
          : "Highlighted departments aren't feeding any section yet — their submitted content won't reach the report."}
      </p>
    </section>
  )
}
