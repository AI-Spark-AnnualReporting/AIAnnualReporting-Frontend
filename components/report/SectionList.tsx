"use client"

import { useState } from "react"
import { CycleReportSection } from "@/types"
import { SECTION_MODES, SECTION_LAYERS } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { isSectionReady } from "@/lib/section-filters"
import {
  EXECUTIVE_SUMMARY_CODE,
  EXECUTIVE_SUMMARY_TITLE,
} from "@/components/report/ExecutiveSummaryPanel"
import { Check, ChevronRight, Circle, CircleDot, List } from "lucide-react"
import { headingAnchorId, subsectionsOf } from "@/lib/sectionOutline"

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
  expanded,
  onToggle,
}: {
  title: string
  active: boolean
  status: React.ReactNode
  modeLabel: string
  modeColor: string
  onClick: () => void
  isRtl?: boolean
  /** Only passed when the section has subsections to disclose. */
  expanded?: boolean
  onToggle?: () => void
}) {
  return (
    // A div, not a button: the chevron is its own control and a button cannot
    // nest inside one. The title carries the row's click instead.
    <div
      // dir on the row (not just the title) so the chevron, status icon and
      // mode chip all swap sides too.
      dir={isRtl ? "rtl" : "ltr"}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors",
        active ? "bg-slate-100" : "hover:bg-slate-50",
      )}
    >
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? `Hide ${title} subsections` : `Show ${title} subsections`}
          className="-m-1 shrink-0 rounded p-1 text-slate-400 transition-colors hover:text-slate-700"
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              expanded && "rotate-90",
              isRtl && !expanded && "rotate-180",
            )}
          />
        </button>
      ) : (
        // Keeps titles aligned down the rail whether or not a section has
        // subsections — matches the chevron's width plus its gap.
        <span className="w-3.5 shrink-0" aria-hidden />
      )}
      {status}
      {/* Semibold and full black whether or not the row is selected: the
          filled background already marks selection, so neither weight nor
          colour has to carry it, and both are free to separate sections from
          the subsections beneath them. */}
      <button
        type="button"
        onClick={onClick}
        className="min-w-0 flex-1 truncate text-start text-sm font-semibold text-black"
      >
        {title}
      </button>
      <span
        className={cn(
          "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium",
          modeColor,
        )}
      >
        {modeLabel}
      </span>
    </div>
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
  /** `anchorId` is set when a subsection row was clicked, so the panel can
   *  scroll to that heading rather than just opening the section at the top. */
  onSelect: (code: string, anchorId?: string) => void
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

  // Which sections are showing their subsections. Starts empty: seventeen
  // sections with up to six subsections each is sixty-odd rows, and the rail is
  // for finding a section first.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Only sections that actually have subsections can be disclosed, so the
  // expand-all control hides entirely on a report that has none yet.
  const withSubs = ordered.filter((s) => subsectionsOf(s.content).length > 0)
  const allOpen = withSubs.length > 0 && withSubs.every((s) => expanded.has(s.section_code))

  const toggle = (code: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })

  return (
    <div className="flex flex-col px-2 py-2">
      {withSubs.length > 0 && (
        <button
          type="button"
          onClick={() =>
            setExpanded(
              allOpen
                ? new Set()
                : new Set(withSubs.map((s) => s.section_code)),
            )
          }
          className="mb-1 self-end rounded px-2 py-1 text-xs font-medium text-indigo-600 transition-colors hover:bg-slate-50"
        >
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      )}

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
        const subs = subsectionsOf(section.content)
        const isOpen = expanded.has(section.section_code)

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
              expanded={subs.length > 0 ? isOpen : undefined}
              onToggle={
                subs.length > 0 ? () => toggle(section.section_code) : undefined
              }
            />
            {/* The section's own subsections — the `###` headings in its body.
                A section written before the writer was told to use them, or one
                the PM has not split up, simply has none and renders as it did
                before. */}
            {isOpen &&
              subs.map((sub, j) => (
                <SubsectionRow
                  key={`${sub.line}-${j}`}
                  title={sub.title}
                  active={section.section_code === selectedCode}
                  onClick={() =>
                    onSelect(section.section_code, headingAnchorId(sub.title))
                  }
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
