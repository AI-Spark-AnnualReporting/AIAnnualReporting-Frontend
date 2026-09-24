"use client"

/**
 * The designer's left rail: every section, and the pages inside it.
 *
 * A fork of SectionList.tsx:37-149 rather than a reuse of it, and the visual
 * grammar is copied deliberately so the two read as one component. It is a
 * fork because the children are different things: SectionList's children are
 * the `###` headings in the markdown, while these are the page units the
 * chunker actually cut — which merges short tails and ignores headings that
 * would produce thin pages, so the two counts genuinely differ. Its child row
 * also has no status slot and takes `active` from the parent section, and it
 * takes a CycleReportSection, which carries neither eligibility nor a design.
 */

import {
  Check, Circle, CircleAlert, CircleDot, ListTree, Loader2,
  TriangleAlert,
} from "lucide-react"
import type { DesignSection } from "@/lib/api/createDesign"
import { cn } from "@/lib/utils"

import { TEMPLATE_NAMES } from "./TemplateMini"

export interface RailSelection {
  code: string
  unit: number
}

/** Mirrors TocDesignPanel's NAMES — the rail only needs the noun. */
const TOC_DESIGN_NAMES: Record<string, string> = {
  classic: "Classic",
  editorial: "Editorial",
  modular: "Modular",
  minimal: "Minimal",
  brand_band: "Brand Band",
}

function sectionState(section: DesignSection) {
  if (!section.eligible) return "skipped" as const
  if (!section.extracted) return "pending" as const
  if (section.stale) return "stale" as const
  const units = section.design?.units ?? []
  const chosen = units.filter((u) => u.template_key).length
  if (chosen === 0) return "none" as const
  return chosen === units.length ? ("done" as const) : ("partial" as const)
}

function StatusIcon({ state, busy }: { state: string; busy: boolean }) {
  if (busy) return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-500" />
  if (state === "done")
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500">
        <Check className="h-2.5 w-2.5 text-white" />
      </span>
    )
  if (state === "partial") return <CircleDot className="h-4 w-4 shrink-0 text-amber-500" />
  if (state === "stale") return <TriangleAlert className="h-4 w-4 shrink-0 text-amber-500" />
  if (state === "failed") return <CircleAlert className="h-4 w-4 shrink-0 text-red-500" />
  return <Circle className="h-4 w-4 shrink-0 text-slate-300" />
}

export function CreateDesignRail({
  sections,
  selected,
  onSelect,
  busyCode,
  failed,
  onReExtract,
  tocActive,
  tocDesign,
  onSelectToc,
}: {
  sections: DesignSection[]
  selected: RailSelection | null
  onSelect: (selection: RailSelection) => void
  busyCode?: string | null
  failed?: Record<string, string>
  onReExtract?: (sectionCode: string) => void
  /**
   * The contents page is a REPORT-level choice, so it sits above the section
   * list and stays out of RailSelection — giving it a made-up section_code
   * would put a section that does not exist into every lookup on this screen.
   */
  tocActive?: boolean
  tocDesign?: string | null
  onSelectToc?: () => void
}) {
  // The blueprint carries a `table_of_contents` section whose content is a
  // placeholder — the exporters draw the real contents page themselves. It has
  // always been ineligible for the page designer and showed here greyed out as
  // "Not laid out", which was harmless until the Contents picker appeared
  // directly above it: two rows with the same name, one of them dead. Dropped
  // from the list when the picker is present, since that is now its home.
  const ordered = [...sections]
    .filter((s) => !(onSelectToc && s.section_code === "table_of_contents"))
    .sort((a, b) => a.order - b.order)
  return (
    <div className="space-y-0.5 p-3">
      {onSelectToc && (
        <>
          <button
            type="button"
            onClick={onSelectToc}
            className={cn(
              "mb-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition",
              tocActive ? "bg-indigo-50 text-indigo-900" : "hover:bg-slate-50",
            )}
          >
            <ListTree
              className={cn(
                "h-4 w-4 shrink-0",
                tocActive ? "text-indigo-500" : "text-slate-400",
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">
                Contents page
              </span>
              <span className="block truncate text-[11px] text-slate-500">
                {tocDesign ? TOC_DESIGN_NAMES[tocDesign] ?? tocDesign : "Not chosen"}
              </span>
            </span>
          </button>
          <div className="mb-2 border-b" />
        </>
      )}
      {ordered.map((section) => {
        const units = section.design?.units ?? []
        const state = failed?.[section.section_code]
          ? "failed"
          : sectionState(section)
        const active = selected?.code === section.section_code
        const busy = busyCode === section.section_code
        const only = units[0]

        return (
          <div key={section.section_code}>
            <div
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors",
                active ? "bg-slate-100" : "hover:bg-slate-50",
                !section.eligible && "opacity-60",
              )}
            >
              <span className="w-3.5 shrink-0" aria-hidden />

              <StatusIcon state={state} busy={busy} />

              <button
                type="button"
                disabled={!section.eligible}
                onClick={() => {
                  if (!section.eligible) return
                  onSelect({ code: section.section_code, unit: only?.index ?? 1 })
                }}
                title={section.ineligible_reason ?? undefined}
                className={cn(
                  "min-w-0 flex-1 truncate text-start text-sm font-semibold",
                  section.eligible ? "text-black" : "cursor-not-allowed text-slate-400",
                )}
              >
                {section.title}
              </button>

              {!section.eligible ? (
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                  Not laid out
                </span>
              ) : state === "stale" ? (
                <button
                  type="button"
                  onClick={() => onReExtract?.(section.section_code)}
                  className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100"
                >
                  Changed · re-extract
                </button>
              ) : state === "failed" ? (
                <button
                  type="button"
                  onClick={() => onReExtract?.(section.section_code)}
                  title={failed?.[section.section_code]}
                  className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-100"
                >
                  Retry
                </button>
              ) : only?.template_key ? (
                <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                  {TEMPLATE_NAMES[only.template_key] ?? only.template_key}
                </span>
              ) : null}
            </div>

            {/* No child rows. A section is ONE design now, and the sheets it
                runs to are shown in the panel on the right — the rail used to
                list "parts" that looked like sheets but were not, which is the
                confusion this removal exists to end. */}
          </div>
        )
      })}
    </div>
  )
}
