"use client"

import { CycleReportSection } from "@/types"
import { SECTION_MODES, SECTION_LAYERS } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { isSectionReady } from "@/lib/section-filters"
import {
  EXECUTIVE_SUMMARY_CODE,
  EXECUTIVE_SUMMARY_TITLE,
} from "@/components/report/ExecutiveSummaryPanel"
import { Check, Circle, CircleDot, List } from "lucide-react"
import { subsectionsOf } from "@/lib/sectionOutline"

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
          // Semibold whether or not the row is selected: the filled background
          // already marks selection, so weight is free to carry the hierarchy
          // against the subsection rows instead.
          "min-w-0 flex-1 truncate text-start text-sm font-semibold",
          active ? "text-slate-900" : "text-slate-700",
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

// A subsection row: one heading inside a section's body. Deliberately quieter
// than RailRow — no status, no mode chip — because a subsection has no state of
// its own. Selecting one selects the section it belongs to.
function SubsectionRow({
  title,
  active,
  onClick,
  isRtl,
}: {
  title: string
  active: boolean
  onClick: () => void
  isRtl?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      dir={isRtl ? "rtl" : "ltr"}
      className={cn(
        "flex w-full items-center gap-2 rounded-md py-1.5 text-start transition-colors",
        // Indented past the status icon so the titles line up under the
        // section's own title rather than under its icon.
        isRtl ? "pe-[2.65rem] ps-3" : "ps-[2.65rem] pe-3",
        active ? "bg-slate-50" : "hover:bg-slate-50",
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-700">
        {title}
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
  /** Opens the full hierarchy dialog. Omitted = no "View all" row. */
  onViewAll?: () => void
}

// Left-zone navigation list for the Report Builder. Sections in display order,
// grouped by layer, each row showing live status + mode.
export function SectionList({
  sections,
  selectedCode,
  onSelect,
  isRtl,
  showExecutiveSummary = false,
  onViewAll,
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
            {/* The section's own subsections — the `###` headings in its body.
                A section written before the writer was told to use them, or one
                the PM has not split up, simply has none and renders as it did
                before. */}
            {subsectionsOf(section.content).map((sub, j) => (
              <SubsectionRow
                key={`${sub.line}-${j}`}
                title={sub.title}
                active={section.section_code === selectedCode}
                onClick={() => onSelect(section.section_code)}
                isRtl={isRtl}
              />
            ))}
          </div>
        )
      })}

      {onViewAll && (
        <button
          type="button"
          onClick={onViewAll}
          dir={isRtl ? "rtl" : "ltr"}
          className="mt-2 flex w-full items-center gap-2.5 rounded-lg border-t border-slate-100 px-3 pb-2 pt-3 text-start text-sm font-medium text-indigo-600 transition-colors hover:bg-slate-50"
        >
          <List className="h-4 w-4 shrink-0" />
          Outline
        </button>
      )}
    </div>
  )
}
