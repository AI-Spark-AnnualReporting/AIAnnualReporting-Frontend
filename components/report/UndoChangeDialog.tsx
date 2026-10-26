"use client"

import { useState } from "react"
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ProsePreview } from "@/components/ui/prose-preview"
import { readError, type MutationError } from "@/hooks/useReportBuilder"
import { pmApi, type UndoChange, type UndoHistoryEntry } from "@/lib/api/pm"
import { QUERY_KEYS } from "@/lib/constants"
import { markChanges } from "@/lib/undo-diff"
import { formatDateTime } from "@/lib/utils"

/** The section whose changes the PM wants to undo. */
export interface UndoTarget {
  sectionCode: string
  title: string
  change: UndoChange
}

/* The Undo pop-up: the section's latest change since the check (the only one
 * kept), and how the section will read once it is undone, with what comes back
 * in green and what goes away in red. The undo itself can't be undone. */
export function UndoChangeDialog({
  cycleId,
  target,
  onClose,
}: {
  cycleId: string
  /** Null = closed. */
  target: UndoTarget | null
  onClose: () => void
}) {
  const [undoing, setUndoing] = useState(false)

  return (
    <Dialog open={!!target} onOpenChange={(next) => !next && !undoing && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100%-2rem)] max-w-[760px] flex-col gap-0 p-0">
        {target && (
          <UndoPreview
            cycleId={cycleId}
            target={target}
            undoing={undoing}
            setUndoing={setUndoing}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function UndoPreview({
  cycleId,
  target,
  undoing,
  setUndoing,
  onClose,
}: {
  cycleId: string
  target: UndoTarget
  undoing: boolean
  setUndoing: (value: boolean) => void
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const history = useQuery({
    queryKey: ["undo-history", cycleId, target.sectionCode],
    queryFn: () => pmApi.getUndoHistory(cycleId, target.sectionCode),
    staleTime: 0,
  })
  // Newest first; only the latest is undone.
  const latest = history.data?.changes?.[0]
  const after = latest?.text ?? ""

  const confirm = async () => {
    setUndoing(true)
    try {
      const remaining = await pmApi.undoSectionChange(cycleId, target.sectionCode, 1)
      toast.success(undoneMessage(target.title, remaining))
      // The pill's count changes now; the rest follows the reloads below.
      setUndoCount(queryClient, cycleId, target.sectionCode, remaining)
      // The validation (Fixed) and the section's text both changed. Not
      // awaited: the section list takes seconds to reload, and the pop-up
      // shouldn't sit on "Undoing…" until it does.
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PM_FINAL_REPORT(cycleId) })
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PM_CYCLE_SECTIONS(cycleId) })
      onClose()
    } catch (err) {
      toast.error(readError(err as MutationError, "Couldn't undo that change"))
    } finally {
      setUndoing(false)
    }
  }

  return (
    <>
      <DialogHeader className="border-b border-slate-200 px-6 pb-4 pt-5 text-left">
        <DialogTitle>Undo change to {target.title}</DialogTitle>
        <DialogDescription>
          {latest ? (
            <>
              <span className="font-semibold text-[#1A1D2E]">{latest.what}</span>
              {whoAndWhen(latest) && ` · ${whoAndWhen(latest)}`}
            </>
          ) : (
            "Loading the latest change…"
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="flex min-h-0 flex-1 flex-col">
        <p className="px-6 pb-2 pt-4 text-sm font-bold text-[#1A1D2E]">
          How the section will read after the undo
        </p>
        <div className="mx-6 mb-4 min-h-[12rem] overflow-y-auto rounded-xl border border-slate-200 px-5 py-4 md:max-h-[55vh]">
          {history.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          ) : after.trim() ? (
            <ProsePreview
              content={markChanges(history.data?.current_text ?? "", after)}
              changeMarks
            />
          ) : latest ? (
            <p className="text-sm italic text-slate-400">The section was empty.</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-lg border-t border-slate-200 bg-slate-50 px-6 py-3.5">
        <p className="text-sm text-slate-500">An undone change can&apos;t be brought back.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={undoing}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={undoing || !latest}>
            {undoing ? "Undoing…" : "Undo change"}
          </Button>
        </div>
      </div>
    </>
  )
}

/** "Usama · 15 Oct 2026, 14:32", leaving out whatever wasn't recorded. */
function whoAndWhen(change: UndoHistoryEntry): string {
  const parts: string[] = []
  if (change.by) parts.push(change.by)
  if (change.at) parts.push(formatDateTime(change.at))
  return parts.join(" · ")
}

/** The toast after an undo. */
function undoneMessage(title: string, remaining: number): string {
  if (remaining === 0) return `Change undone. Nothing more to undo in ${title}.`
  return `Change undone. ${title} has ${remaining} more to undo.`
}

type FinalReport = Awaited<ReturnType<typeof pmApi.getFinalReport>>

/** Show the section's new undo count in the cached report straight away
 *  (none left = no pill). Who/when of the last change catch up on reload. */
function setUndoCount(
  queryClient: QueryClient,
  cycleId: string,
  sectionCode: string,
  remaining: number,
): void {
  queryClient.setQueryData<FinalReport>(QUERY_KEYS.PM_FINAL_REPORT(cycleId), (report) => {
    const changes = report?.validation?.undo_changes
    if (!report?.validation || !changes?.[sectionCode]) return report
    const next = { ...changes }
    if (remaining > 0) next[sectionCode] = { ...next[sectionCode], count: remaining }
    else delete next[sectionCode]
    return { ...report, validation: { ...report.validation, undo_changes: next } }
  })
}
