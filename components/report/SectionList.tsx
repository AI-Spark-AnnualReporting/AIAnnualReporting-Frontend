"use client"

import { CycleReportSection } from "@/types"
import { SECTION_MODES, SECTION_LAYERS } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { isSectionReady } from "@/lib/section-filters"
import { Check, Circle, CircleDot } from "lucide-react"

// Status indicator — hollow circle (pending) / amber dot (drafting) / filled
// green check (ready). Auto sections are system-rendered and the cover is always
// ready (optional image), so they read as always-ready without an explicit lock.
function StatusIcon({ section }: { section: CycleReportSection }) {
  if (isSectionReady(section))
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500">
        <Check className="h-3 w-3 text-white" strokeWidth={3} />
      </span>
    )
  if (section.status === "drafting")
    return <CircleDot className="h-5 w-5 shrink-0 text-amber-500" />
  return <Circle className="h-5 w-5 shrink-0 text-slate-300" />
}

interface SectionListProps {
  sections: CycleReportSection[]
  selectedCode: string | null
  onSelect: (code: string) => void
  isRtl?: boolean
}

// Left-zone navigation list for the Report Builder. Sections in display order,
// grouped by layer, each row showing live status + mode.
export function SectionList({ sections, selectedCode, onSelect, isRtl }: SectionListProps) {
  const ordered = [...sections].sort((a, b) => a.display_order - b.display_order)

  return (
    <div className="flex flex-col px-2 py-2">
      {ordered.map((section, i) => {
        // Layer divider whenever the previous section was in a different
        // layer (or this is the first section). Derived inline — avoids
        // mutating render-scoped state.
        const prevLayer = i > 0 ? ordered[i - 1].layer : null
        const showDivider = section.layer !== prevLayer
        const mode = SECTION_MODES[section.mode]
        const active = section.section_code === selectedCode

        return (
          <div key={section.section_code}>
            {showDivider && (
              <div className="px-3 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {SECTION_LAYERS[section.layer]?.label ?? section.layer}
              </div>
            )}
            <button
              type="button"
              onClick={() => onSelect(section.section_code)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors",
                active ? "bg-slate-100" : "hover:bg-slate-50",
              )}
            >
              <StatusIcon section={section} />
              <span
                dir={isRtl ? "rtl" : "ltr"}
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  isRtl ? "text-right" : "text-left",
                  active ? "font-semibold text-slate-900" : "text-slate-700",
                )}
              >
                {section.title}
              </span>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium",
                  mode?.color ?? "bg-slate-100 text-slate-600",
                )}
              >
                {mode?.label ?? section.mode}
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
