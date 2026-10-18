"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { readError, type MutationError } from "@/hooks/useReportBuilder"
import { pmApi, type UndoChange } from "@/lib/api/pm"
import { QUERY_KEYS } from "@/lib/constants"
import { formatDateTime } from "@/lib/utils"

/** The section whose last change the PM wants to undo. */
export interface UndoTarget {
  sectionCode: string
  title: string
  change: UndoChange
}

/* "Undo the last change to <section>?" - asked before the section's text is
 * put back to how it was before its last change since the check. One change
 * per click; the undo itself can't be undone. */
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
  const queryClient = useQueryClient()
  const [undoing, setUndoing] = useState(false)

  const confirm = async () => {
    if (!target) return
    setUndoing(true)
    try {
      const remaining = await pmApi.undoSectionChange(cycleId, target.sectionCode)
      toast.success(undoneMessage(target.title, remaining))
      // The validation (Fixed, undo counts) and the section's text both changed.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PM_FINAL_REPORT(cycleId) }),
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PM_CYCLE_SECTIONS(cycleId) }),
      ])
      onClose()
    } catch (err) {
      toast.error(readError(err as MutationError, "Couldn't undo that change"))
    } finally {
      setUndoing(false)
    }
  }

  const count = target?.change.count ?? 0

  return (
    <Dialog open={!!target} onOpenChange={(next) => !next && !undoing && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Undo the last change to {target?.title}?</DialogTitle>
          <DialogDescription>
            {count <= 1
              ? "The section goes back to the text that was checked."
              : `The section goes back to how it was before this change. ${earlierLine(count - 1)}`}
          </DialogDescription>
        </DialogHeader>

        {target && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <p className="font-semibold text-[#1A1D2E]">Change to undo: {target.change.what}</p>
            <p className="text-xs text-slate-500">{whoAndWhen(target.change)}</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={undoing}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={undoing}>
            {undoing ? "Undoing…" : "Undo change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** "2 earlier changes stay." */
function earlierLine(earlier: number): string {
  if (earlier === 1) return "1 earlier change stays."
  return `${earlier} earlier changes stay.`
}

/** "Usama · 15 Oct 2026, 14:32", leaving out whatever wasn't recorded. */
function whoAndWhen(change: UndoChange): string {
  const parts: string[] = []
  if (change.by) parts.push(change.by)
  if (change.at) parts.push(formatDateTime(change.at))
  return parts.join(" · ")
}

/** The toast after an undo. */
function undoneMessage(title: string, remaining: number): string {
  if (remaining === 0) return `${title} is back to the checked text.`
  return `Change undone. ${title} has ${remaining} more to undo.`
}
