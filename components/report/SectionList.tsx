"use client"

import { CycleReportSection } from "@/types"
import { SECTION_MODES, SECTION_LAYERS } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { isSectionReady } from "@/lib/section-filters"
import {
  EXECUTIVE_SUMMARY_CODE,
  EXECUTIVE_SUMMARY_TITLE,
} from "@/components/report/ExecutiveSummaryPanel"
import { Check, Circle, CircleDot } from "lucide-react"

// "Handled for you" — the same filled green check the system-rendered sections
// used to carry. Nothing to lock, nothing to chase.
function ReadyIcon() {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500">
      <Check className="h-3 w-3 text-white" strokeWidth={3} />
    </span>
  )
}

// Status indicator — hollow circle (pending) / amber dot (drafting) / filled
// green check (ready). Auto sections are system-rendered, so they read as
// always-ready without an explicit lock.
function StatusIcon({ section }: { section: CycleReportSection }) {
  if (isSectionReady(section)) return <ReadyIcon />
  if (section.status === "drafting")
    return <CircleDot className="h-5 w-5 shrink-0 text-amber-500" />
  return <Circle className="h-5 w-5 shrink-0 text-slate-300" />
}

// One rail row. Shared by the cycle's real sections and by the synthetic
// Executive Summary entry, which has no section row to render from.
function RailRow({
  title,
  active,
  status,
  modeLabel,
  modeColor,
  onClick,
  isRtl,
}: {
  title: string
  active: boolean
  status: React.ReactNode
  modeLabel: string
  modeColor: string
  onClick: () => void
  isRtl?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // dir on the row (not just the title) so the status icon and mode
      // chip swap sides too.
      dir={isRtl ? "rtl" : "ltr"}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-start transition-colors",
        active ? "bg-slate-100" : "hover:bg-slate-50",
      )}
    >
      {status}
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm text-start",
          active ? "font-semibold text-slate-900" : "text-slate-700",
        )}
      >
        {title}
      </span>
      <span
        className={cn(
          "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium",
          modeColor,
        )}
      >
        {modeLabel}
      </span>
    </button>
  )
}

interface SectionListProps {
  sections: CycleReportSection[]
  selectedCode: string | null
  onSelect: (code: string) => void
  isRtl?: boolean
  // Prepend the synthetic Executive Summary row. It is not a section: it never
  // counts toward "N of N sections locked" and never blocks Assemble.
  showExecutiveSummary?: boolean
}

// Left-zone navigation list for the Report Builder. Sections in display order,
// grouped by layer, each row showing live status + mode.
export function SectionList({
  sections,
  selectedCode,
  onSelect,
  isRtl,
  showExecutiveSummary = false,
}: SectionListProps) {
  const ordered = [...sections].sort((a, b) => a.display_order - b.display_order)

  return (
    <div className="flex flex-col px-2 py-2">
      {/* First in the rail — the assembled report opens with it. */}
      {showExecutiveSummary && (
        <RailRow
          title={EXECUTIVE_SUMMARY_TITLE}
          active={selectedCode === EXECUTIVE_SUMMARY_CODE}
          status={<ReadyIcon />}
          modeLabel={SECTION_MODES.auto.label}
          modeColor={SECTION_MODES.auto.color}
          onClick={() => onSelect(EXECUTIVE_SUMMARY_CODE)}
          isRtl={isRtl}
        />
      )}
      {ordered.map((section, i) => {
        // Layer divider whenever the previous section was in a different
        // layer (or this is the first section). Derived inline — avoids
        // mutating render-scoped state.
        const prevLayer = i > 0 ? ordered[i - 1].layer : null
        const showDivider = section.layer !== prevLayer
        const mode = SECTION_MODES[section.mode]

        return (
          <div key={section.section_code}>
            {showDivider && (
              <div className="px-3 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {SECTION_LAYERS[section.layer]?.label ?? section.layer}
              </div>
            )}
            <RailRow
              title={section.title}
              active={section.section_code === selectedCode}
              status={<StatusIcon section={section} />}
              modeLabel={mode?.label ?? section.mode}
              modeColor={mode?.color ?? "bg-slate-100 text-slate-600"}
              onClick={() => onSelect(section.section_code)}
              isRtl={isRtl}
            />
          </div>
        )
      })}
    </div>
  )
}
