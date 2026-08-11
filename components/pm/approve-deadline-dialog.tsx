"use client"

import { CalendarClock, CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { cn, formatDate } from "@/lib/utils"

/* ── Approve & use — questions-deadline modal ────────────────────────────────
   Blocks the cycle from moving forward until the PM commits a date by which
   departments must answer their assigned questions. Past dates are rejected
   (the input's min + a guarded confirm button), so there is no way to advance
   without a valid future-or-today deadline.

   Lived inside the brief review page until concept messages became the last
   step of the wizard; it's shared rather than duplicated. */
export function ApproveDeadlineDialog({
  open,
  onOpenChange,
  value,
  onChange,
  min,
  valid,
  canApprove,
  numQuestions,
  onNumQuestionsChange,
  submitting,
  onConfirm,
  cycleLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string
  onChange: (value: string) => void
  min: string
  valid: boolean
  canApprove: boolean
  numQuestions: number
  onNumQuestionsChange: (value: number) => void
  submitting: boolean
  onConfirm: () => void
  cycleLabel: string
}) {
  // Distinguish "nothing chosen yet" from "chose a past date" for the helper text.
  const isPast = !!value && value < min

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 overflow-hidden p-0" hideClose={submitting}>
        {/* Themed header band */}
        <DialogHeader className="space-y-3 border-b bg-indigo-50 px-6 py-5 text-left">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <DialogTitle className="text-indigo-900">Set the questions deadline</DialogTitle>
            <p className="text-sm text-indigo-700/80">
              Approving locks in the brief for <span className="font-medium">{cycleLabel}</span>.
              Choose the date every department must answer its assigned questions by — they&apos;ll
              be notified straight away.
            </p>
          </div>
        </DialogHeader>

        <div className="space-y-2 px-6 py-5">
          <label htmlFor="questions-deadline" className="text-sm font-medium text-foreground">
            Questions deadline
          </label>
          <Input
            id="questions-deadline"
            type="date"
            value={value}
            min={min}
            disabled={submitting}
            onChange={(e) => onChange(e.target.value)}
            className={cn(
              "h-11",
              isPast && "border-destructive focus-visible:ring-destructive",
            )}
          />
          {isPast ? (
            <p className="text-xs font-medium text-destructive">
              The deadline can&apos;t be in the past. Pick today or a later date.
            </p>
          ) : valid ? (
            <p className="text-xs text-muted-foreground">
              Departments must answer by{" "}
              <span className="font-medium text-foreground">{formatDate(value)}</span>.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              A deadline is required before the cycle can move forward.
            </p>
          )}
        </div>

        {/* Questions-per-department slider (5-20, backend default 12) */}
        <div className="space-y-2 border-t px-6 py-5">
          <div className="flex items-center justify-between">
            <label htmlFor="num-questions" className="text-sm font-medium text-foreground">
              Questions per department:{" "}
              <span className="tabular-nums text-foreground">{numQuestions}</span>
            </label>
            {numQuestions === 12 && (
              <span className="text-xs text-muted-foreground">(default)</span>
            )}
          </div>
          <input
            id="num-questions"
            type="range"
            min={5}
            max={20}
            step={1}
            value={numQuestions}
            disabled={submitting}
            onChange={(e) => onNumQuestionsChange(parseInt(e.target.value, 10))}
            className="h-1.5 w-full cursor-pointer accent-indigo-600"
          />
          <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
            <span>5</span>
            <span>12</span>
            <span>20</span>
          </div>
          <p className="text-xs text-muted-foreground">
            How many questions the AI generates for each department.
          </p>
        </div>

        <DialogFooter className="gap-2 border-t bg-muted/30 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!canApprove || submitting}
            className="bg-indigo-600 text-white hover:bg-indigo-700"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Setting deadline…</>
            ) : (
              <><CheckCircle2 className="h-4 w-4" /> Approve &amp; continue</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
