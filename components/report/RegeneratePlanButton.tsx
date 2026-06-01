"use client"

import { useState } from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useBuildPlan } from "@/hooks/useReportBuilder"

export function RegeneratePlanButton({ cycleId }: { cycleId: string }) {
  const [open, setOpen] = useState(false)
  const build = useBuildPlan(cycleId)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={build.isPending}
        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
      >
        {build.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        Regenerate plan
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
