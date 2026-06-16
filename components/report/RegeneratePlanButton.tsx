"use client"

import { useState } from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useBuildPlan } from "@/hooks/useReportBuilder"

export function RegeneratePlanButton({
  cycleId,
  disabled,
}: {
  cycleId: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const build = useBuildPlan(cycleId)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={build.isPending || disabled}
        title={
          disabled
            ? "Sections are locked — the plan can no longer be regenerated"
            : undefined
        }
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {build.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        Regenerate reporting sections
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Regenerate the plan?"
        description="This replaces the current headline, themes, and feeder assignments with a fresh AI plan. Your manual edits will be lost."
        confirmLabel="Regenerate"
        variant="destructive"
        isLoading={build.isPending}
        onConfirm={async () => {
          await build.mutateAsync({ refresh: true })
          setOpen(false)
        }}
      />
    </>
  )
}
