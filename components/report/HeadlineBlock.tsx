"use client"

import { useState } from "react"
import { Loader2, Pencil, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useBuildPlan, useUpdatePlan } from "@/hooks/useReportBuilder"

interface HeadlineBlockProps {
  cycleId: string
  headline: string | null
}

export function HeadlineBlock({ cycleId, headline }: HeadlineBlockProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(headline ?? "")
  const [regenOpen, setRegenOpen] = useState(false)

  const update = useUpdatePlan(cycleId)
  const build = useBuildPlan(cycleId)

  // Re-seed draft from server when the headline changes externally
  // (regenerate, navigating between cycles).
  const [prevHeadline, setPrevHeadline] = useState(headline)
  if (prevHeadline !== headline) {
    setPrevHeadline(headline)
    if (!editing) setDraft(headline ?? "")
  }

  const startEdit = () => {
    setDraft(headline ?? "")
    setEditing(true)
  }

  const cancel = () => {
    setDraft(headline ?? "")
    setEditing(false)
  }

  const save = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    update.mutate(
      { headline: trimmed },
      { onSuccess: () => setEditing(false) },
    )
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Headline
        </span>
        <button
          type="button"
          onClick={() => setRegenOpen(true)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          disabled={build.isPending}
        >
          {build.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Regenerate plan
        </button>
      </div>

      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Write a one-line headline for the report"
            className="text-lg font-medium"
            autoFocus
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={cancel}
              disabled={update.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={save}
              disabled={update.isPending || !draft.trim()}
            >
              {update.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : null}
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="group flex items-start gap-3">
          <h2 className="flex-1 text-2xl font-semibold leading-tight">
            {headline?.trim() || (
              <span className="text-muted-foreground italic font-normal">
                No headline yet — click edit to add one.
              </span>
            )}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={startEdit}
            className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Edit headline"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        title="Regenerate the plan?"
        description="This replaces the current headline, themes, and feeder assignments with a fresh AI plan. Your manual edits will be lost."
        confirmLabel="Regenerate"
        variant="destructive"
        isLoading={build.isPending}
        onConfirm={async () => {
          await build.mutateAsync({ refresh: true })
          setRegenOpen(false)
        }}
      />
    </section>
  )
}
