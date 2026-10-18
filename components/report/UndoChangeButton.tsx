"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Undo2 } from "lucide-react"

import { UndoChangeDialog, type UndoTarget } from "@/components/report/UndoChangeDialog"
import { pmApi, type UndoChange } from "@/lib/api/pm"
import { QUERY_KEYS } from "@/lib/constants"
import { formatDateTime } from "@/lib/utils"

/* The Undo pill: "↶ Undo (2)". Shared by the Validation page (beside Fixed)
   and the Build page (beside Saved / Edit), so the two look the same. */
export function UndoChangeButton({
  change,
  onClick,
  label = "Undo",
  disabled = false,
}: {
  change: UndoChange
  onClick: () => void
  label?: string
  /** The section is being rewritten (refine, save, upload): an undo now
   *  would be overwritten when that finishes. */
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={disabled ? "Wait for this section to finish updating." : lastChangeText(change)}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 pl-2.5 pr-1 text-xs font-semibold text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-indigo-50"
    >
      <Undo2 className="h-3.5 w-3.5" />
      {label}
      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[10px] font-bold tabular-nums text-white">
        {change.count}
      </span>
    </button>
  )
}

/** "Last: Refined with AI · Usama · 18 Oct 2026, 14:32", leaving out what wasn't recorded. */
function lastChangeText(change: UndoChange): string {
  const parts = [`Last: ${change.what}`]
  if (change.by) parts.push(change.by)
  if (change.at) parts.push(formatDateTime(change.at))
  return parts.join(" · ")
}

/* Undo on the Build page: the pill for one section, plus its "Are you sure?"
   pop-up. Nothing when the section has no change kept since the validation. */
export function SectionUndo({
  cycleId,
  sectionCode,
  disabled = false,
}: {
  cycleId: string
  sectionCode: string
  /** Greyed out while the section is being rewritten. */
  disabled?: boolean
}) {
  // The same cached report the builder already loads. Never stale on its own:
  // useFinalReport refetches on every mount, and this mounts on each section
  // switch, which would reload the whole report each time. Every section save
  // invalidates this query, so the count still follows the edits.
  const reportQuery = useQuery({
    queryKey: QUERY_KEYS.PM_FINAL_REPORT(cycleId),
    queryFn: () => pmApi.getFinalReport(cycleId),
    staleTime: Infinity,
    retry: false,
  })
  const [target, setTarget] = useState<UndoTarget | null>(null)

  const validation = reportQuery.data?.validation
  const change = validation?.undo_changes?.[sectionCode]
  if (!change) return null
  const title = validation?.sections?.[sectionCode]?.title || "this section"

  return (
    <>
      <UndoChangeButton
        change={change}
        disabled={disabled}
        onClick={() => setTarget({ sectionCode, title, change })}
      />
      <UndoChangeDialog cycleId={cycleId} target={target} onClose={() => setTarget(null)} />
    </>
  )
}
