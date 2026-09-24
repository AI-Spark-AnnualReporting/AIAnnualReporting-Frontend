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
  Check, ChevronRight, Circle, CircleAlert, CircleDot, Loader2, TriangleAlert,
} from "lucide-react"
import { useState } from "react"

import type { DesignSection } from "@/lib/api/createDesign"
import { cn } from "@/lib/utils"

import { TEMPLATE_NAMES } from "./TemplateMini"

export interface RailSelection {
  code: string
  unit: number
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
}: {
  sections: DesignSection[]
  selected: RailSelection | null
  onSelect: (selection: RailSelection) => void
  busyCode?: string | null
  failed?: Record<string, string>
  onReExtract?: (sectionCode: string) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const ordered = [...sections].sort((a, b) => a.order - b.order)
  // The section holding the selection is always open. Derived rather than
  // stored, so it cannot drift out of sync with the selection.
  const isOpen = (code: string) => expanded.has(code) || selected?.code === code

  const open_ = (code: string) =>
    setExpanded((prev) => (prev.has(code) ? prev : new Set(prev).add(code)))

  const toggle = (code: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })

  return (
    <div className="space-y-0.5 p-3">
      {ordered.map((section) => {
        const units = section.design?.units ?? []
        const multi = units.length > 1
        const open = isOpen(section.section_code)
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
              {multi ? (
                <button
                  type="button"
                  onClick={() => toggle(section.section_code)}
                  aria-expanded={open}
                  aria-label={open ? `Hide ${section.title} pages` : `Show ${section.title} pages`}
                  className="-m-1 shrink-0 rounded p-1 text-slate-400 transition-colors hover:text-slate-700"
                >
                  <ChevronRight
                    className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")}
                  />
                </button>
              ) : (
                <span className="w-3.5 shrink-0" aria-hidden />
              )}

              <StatusIcon state={state} busy={busy} />

              <button
                type="button"
                disabled={!section.eligible}
                onClick={() => {
                  if (!section.eligible) return
                  if (multi) {
                    // OPEN, never toggle. The title is the row's primary hit
                    // target and the chevron is the only control meant to
                    // close; making the title flip meant clicking the section
                    // you were already working in collapsed its pages and
                    // threw the selection back to page 1.
                    open_(section.section_code)
                    // Keep the page you are already on within this section.
                    onSelect({
                      code: section.section_code,
                      unit:
                        selected?.code === section.section_code
                          ? selected.unit
                          : units[0]?.index ?? 1,
                    })
                  } else {
                    onSelect({ code: section.section_code, unit: only?.index ?? 1 })
                  }
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
              ) : multi ? (
                <span className="shrink-0 text-[11px] text-slate-400">
                  {units.filter((u) => u.template_key && !u.template_auto).length} of{" "}
                  {units.length} reviewed
                </span>
              ) : only?.template_key ? (
                <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                  {TEMPLATE_NAMES[only.template_key] ?? only.template_key}
                </span>
              ) : null}
            </div>

            {multi && open &&
              units.map((unit) => {
                const unitActive = active && selected?.unit === unit.index
                return (
                  <button
                    key={unit.index}
                    type="button"
                    onClick={() => onSelect({ code: section.section_code, unit: unit.index })}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg py-1.5 pe-3 ps-[2.65rem] text-start transition-colors",
                      unitActive ? "bg-slate-100" : "hover:bg-slate-50",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        // Solid = a person picked it. Hollow = the art
                        // director picked it and nobody has looked yet. Both
                        // are "chosen"; only one has been reviewed.
                        !unit.template_key
                          ? "bg-slate-300"
                          : unit.template_auto
                            ? "border border-emerald-500 bg-white"
                            : "bg-emerald-500",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-slate-700">
                      {unit.title}
                      <span className="ms-1.5 text-slate-400">
                        · {unit.index}/{unit.total}
                      </span>
                    </span>
                    {unit.template_key && (
                      <span className="shrink-0 text-[11px] text-indigo-600">
                        {TEMPLATE_NAMES[unit.template_key] ?? unit.template_key}
                      </span>
                    )}
                  </button>
                )
              })}
          </div>
        )
      })}
    </div>
  )
}
