"use client"

import { useState } from "react"
import {
  CheckCircle2,
  Loader2,
  Lock,
  LockOpen,
  PenLine,
  Save,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ProsePreview } from "@/components/ui/prose-preview"
import { SectionHeader } from "@/components/report/SectionDetail"
import {
  useLockSection,
  useSaveManualContent,
  useUnlockSection,
} from "@/hooks/useReportBuilder"
import { formatDateTime } from "@/lib/utils"
import type { CycleReportSection } from "@/types"

// Manual section editor: no source picker, no Generate button. The PM writes
// the body directly and saves it. Rendered when `section.ai_allowed === false`.
export function ManualSection({
  section,
  cycleId,
}: {
  section: CycleReportSection
  cycleId: string
}) {
  const sectionCode = section.section_code
  const saved = section.content ?? ""

  const [draft, setDraft] = useState(saved)

  // Re-seed the draft when the server content changes externally (e.g. after
  // unlocking, or switching sections in the builder).
  const [prevSaved, setPrevSaved] = useState(saved)
  if (prevSaved !== saved) {
    setPrevSaved(saved)
    setDraft(saved)
  }

  const save = useSaveManualContent(cycleId)
  const lock = useLockSection(cycleId)
  const unlock = useUnlockSection(cycleId)

  const dirty = draft !== saved
  const trimmed = draft.trim()
  const isLocked = section.status === "locked"

  if (isLocked) {
    return (
      <div className="flex flex-1 flex-col min-h-0">
        <SectionHeader section={section} />
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 py-6 space-y-5">
            <div className="rounded-lg border bg-card p-6">
              {saved.trim() ? (
                <ProsePreview content={saved} />
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No content saved.
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900/50 dark:bg-green-950/25">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  Section locked
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Locked on {formatDateTime(section.locked_at)}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end">
              <Button
                variant="outline"
                onClick={() => unlock.mutate({ sectionCode })}
                disabled={unlock.isPending}
              >
                {unlock.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <LockOpen className="h-4 w-4 mr-2" />
                )}
                Unlock
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <SectionHeader section={section} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-6 space-y-5">
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
            <PenLine className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              This section is written manually and is not AI-generated. Type
              the content below and click Save.
            </span>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="manual-section-content"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Enter section content
            </label>
            <Textarea
              id="manual-section-content"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write the content for this section…"
              rows={14}
              className="text-sm leading-relaxed"
            />
            <div className="flex items-center justify-between text-xs">
              {dirty ? (
                <span className="text-amber-700 dark:text-amber-400">
                  Unsaved changes
                </span>
              ) : saved.trim() ? (
                <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Saved
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Not saved yet
                </span>
              )}
              <span className="text-muted-foreground tabular-nums">
                {draft.length} chars
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="outline"
              onClick={() =>
                save.mutate({ sectionCode, content: draft })
              }
              disabled={save.isPending || !dirty || !trimmed}
              title={
                !trimmed
                  ? "Add some content before saving"
                  : !dirty
                    ? "No changes to save"
                    : undefined
              }
            >
              {save.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
            <Button
              onClick={() => lock.mutate({ sectionCode })}
              disabled={lock.isPending || !saved.trim() || dirty}
              title={
                dirty
                  ? "Save your changes before locking"
                  : !saved.trim()
                    ? "Save some content first"
                    : undefined
              }
            >
              {lock.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Lock className="h-4 w-4 mr-2" />
              )}
              Lock section
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
