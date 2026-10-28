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
import { cn, formatDateTime } from "@/lib/utils"

/** The section whose changes the PM wants to undo. */
export interface UndoTarget {
  sectionCode: string
  title: string
  change: UndoChange
}

/* The Undo pop-up: the section's changes since the check on the left, newest
 * first, and on the right how the section will read once the picked change -
 * and every change after it - is undone, with what comes back in green and
 * what goes away in red. Changes build on each other, so an
 * older one can't be undone on its own. The undo itself can't be undone. */
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
      <DialogContent className="flex max-h-[90vh] w-[calc(100%-2rem)] max-w-[900px] flex-col gap-0 p-0">
        {target && (
          // Keyed so the picked row starts on the latest change every time.
          <UndoPicker
            key={`${target.sectionCode}:${target.change.count}`}
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

function UndoPicker({
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
  // Index into the newest-first list: 0 = the latest change.
  const [picked, setPicked] = useState(0)
  const history = useQuery({
    queryKey: ["undo-history", cycleId, target.sectionCode],
    queryFn: () => pmApi.getUndoHistory(cycleId, target.sectionCode),
    staleTime: 0,
  })
  const changes = history.data?.changes ?? []
  const chosen = changes[picked]
  const after = chosen?.text ?? ""
  const steps = picked + 1

  const confirm = async () => {
    setUndoing(true)
    try {
      const remaining = await pmApi.undoSectionChange(cycleId, target.sectionCode, steps)
      toast.success(undoneMessage(target.title, steps, remaining))
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
        <DialogTitle>Undo changes to {target.title}</DialogTitle>
        <DialogDescription>
          Pick the change to undo. Every change after it is undone too. Only the last 10
          changes since the last check are kept.
        </DialogDescription>
      </DialogHeader>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)]">
        <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto border-b border-slate-200 p-3 md:max-h-none md:border-b-0 md:border-r">
          <p className="sticky -top-3 z-10 bg-white px-1.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Changes since the last check · {changes.length} of 10 kept
          </p>
          {history.isLoading && <Loader2 className="m-4 h-4 w-4 animate-spin text-slate-400" />}
          {changes.map((change, i) => (
            <ChangeRow
              key={i}
              change={change}
              tag={i === 0 ? "latest" : i === changes.length - 1 ? "oldest" : ""}
              state={i === picked ? "picked" : i < picked ? "undone" : "kept"}
              onPick={() => setPicked(i)}
            />
          ))}
        </div>

        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-2 pt-3">
            <p className="text-sm font-bold text-[#1A1D2E]">How the section will read</p>
            {chosen && <p className="text-xs text-slate-500">Before &ldquo;{chosen.what}&rdquo;</p>}
          </div>
          <div className="mx-5 mb-4 min-h-[12rem] overflow-y-auto rounded-xl border border-slate-200 px-5 py-4 md:max-h-[50vh]">
            {after.trim() ? (
              <ProsePreview
                content={markChanges(history.data?.current_text ?? "", after)}
                changeMarks
              />
            ) : chosen ? (
              <p className="text-sm italic text-slate-400">The section was empty.</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-lg border-t border-slate-200 bg-slate-50 px-6 py-3.5">
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-[#1A1D2E]">{changesText(steps)}</span> will be
          undone. Undone changes can&apos;t be brought back.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={undoing}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={undoing || !chosen}>
            {undoing ? "Undoing…" : `Undo ${changesText(steps)}`}
          </Button>
        </div>
      </div>
    </>
  )
}

/* One change in the list. Rows newer than the picked one are crossed out:
   they are undone with it. */
function ChangeRow({
  change,
  tag,
  state,
  onPick,
}: {
  change: UndoHistoryEntry
  tag: string
  state: "picked" | "undone" | "kept"
  onPick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "grid w-full grid-cols-[16px_minmax(0,1fr)] items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
        state === "picked"
          ? "border-indigo-200 bg-indigo-50"
          : "border-transparent hover:bg-slate-50",
        state === "undone" && "bg-slate-50",
      )}
    >
      <span
        className={cn(
          "mt-0.5 h-4 w-4 rounded-full border-2",
          state === "picked"
            ? "border-indigo-600 bg-[radial-gradient(#4f46e5_0_3.5px,transparent_4px)]"
            : "border-slate-300",
        )}
      />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "text-sm font-semibold",
              state === "undone" ? "text-slate-400 line-through" : "text-[#1A1D2E]",
            )}
          >
            {change.what}
          </span>
          {tag && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {tag}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-slate-500">{whoAndWhen(change)}</span>
      </span>
    </button>
  )
}

/** "1 change", "3 changes". */
function changesText(count: number): string {
  return count === 1 ? "1 change" : `${count} changes`
}

/** "Usama · 15 Oct 2026, 14:32", leaving out whatever wasn't recorded. */
function whoAndWhen(change: UndoHistoryEntry): string {
  const parts: string[] = []
  if (change.by) parts.push(change.by)
  if (change.at) parts.push(formatDateTime(change.at))
  return parts.join(" · ")
}

/** The toast after an undo. */
function undoneMessage(title: string, steps: number, remaining: number): string {
  const done = `${changesText(steps)} undone.`
  if (remaining === 0) return `${done} Nothing more to undo in ${title}.`
  return `${done} ${title} has ${remaining} more to undo.`
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
