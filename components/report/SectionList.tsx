"use client"

import { CycleReportSection, SectionStatus } from "@/types"
import { SECTION_MODES, SECTION_LAYERS } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { Circle, CircleDot, CheckCircle2 } from "lucide-react"

// Status indicator — hollow circle (pending) / half-dot (drafting) / check (locked).
function StatusIcon({ status }: { status: SectionStatus }) {
  if (status === "locked")
    return <CheckCircle2 className="h-4 w-4 text-green-600" />
  if (status === "drafting")
    return <CircleDot className="h-4 w-4 text-yellow-600" />
  return <Circle className="h-4 w-4 text-muted-foreground/50" />
}

interface SectionListProps {
  sections: CycleReportSection[]
  selectedCode: string | null
  onSelect: (code: string) => void
}

// Left-zone navigation list for the Report Builder. Sections in display order,
// grouped by layer, each row showing live status + mode.
export function SectionList({ sections, selectedCode, onSelect }: SectionListProps) {
  const ordered = [...sections].sort((a, b) => a.display_order - b.display_order)

  let lastLayer: string | null = null

  return (
    <div className="flex flex-col">
      {ordered.map((section) => {
        const showDivider = section.layer !== lastLayer
        lastLayer = section.layer
        const mode = SECTION_MODES[section.mode]
        const active = section.section_code === selectedCode

        return (
          <div key={section.section_code}>
            {showDivider && (
              <div className="px-3 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {SECTION_LAYERS[section.layer]?.label ?? section.layer}
              </div>
            )}
            <button
              type="button"
              onClick={() => onSelect(section.section_code)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-l-2",
                active
                  ? "bg-primary/10 border-l-primary"
                  : "border-l-transparent hover:bg-accent"
              )}
            >
              <StatusIcon status={section.status} />
              <span
                className={cn(
                  "flex-1 min-w-0 truncate text-sm",
                  active ? "font-medium text-foreground" : "text-foreground/90"
                )}
              >
                {section.title}
              </span>
              <span
                className={cn(
                  "shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  mode?.color
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
