"use client"

import { useState } from "react"
import {
  CheckCircle2,
  Loader2,
  Lock,
  LockOpen,
  PenLine,
  Save,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ProsePreview } from "@/components/ui/prose-preview"
import { SectionHeader } from "@/components/report/SectionDetail"
import {
  useLockSection,
  usePreviousManualSections,
  useSaveManualContent,
  useUnlockSection,
} from "@/hooks/useReportBuilder"
import { useAuth } from "@/contexts/AuthContext"
import { cn, formatDateTime } from "@/lib/utils"
import { languageMismatchWarning, isLanguageAcceptable } from "@/lib/lang"
import type { ContentLanguage, CycleReportSection } from "@/types"

// Manual section editor: no source picker, no Generate button. The PM writes
// the body directly and saves it. Rendered when `section.ai_allowed === false`.
export function ManualSection({
  section,
  cycleId,
  contentLanguage = "english",
  isRtl = false,
}: {
  section: CycleReportSection
  cycleId: string
  contentLanguage?: ContentLanguage
  isRtl?: boolean
}) {
  const sectionCode = section.section_code
  const saved = section.content ?? ""

  const [draft, setDraft] = useState(saved)
  // Content must be in the cycle's language (warn + block Save), like the dept
  // answer box and the kickoff brief.
  const langWarning = languageMismatchWarning(draft, contentLanguage)
  const langOk = isLanguageAcceptable(draft, contentLanguage)

  // The company's previous manual content, used to pre-fill empty sections.
  // companyId comes from the authenticated user (/auth/me) — a PM is scoped to
  // their own company. The query no-ops until the user (and id) resolve.
  const { user } = useAuth()
  const { data: previous } = usePreviousManualSections(user?.company_id)
  const prevSection = previous?.sections.find(
    (s) => s.section_code === sectionCode,
  )
  // Only suggest a pre-fill when there's prior content AND nothing is saved yet.
  const suggestion =
    !saved.trim() && prevSection?.has_data && prevSection.content
      ? prevSection
      : null

  // Re-seed the draft when the server content changes externally (e.g. after
  // unlocking, or switching sections in the builder).
  const [prevSaved, setPrevSaved] = useState(saved)
  if (prevSaved !== saved) {
    setPrevSaved(saved)
    setDraft(saved)
  }

  // Auto-seed the empty editor with the company's previous content for this
  // section. Runs once per section (guarded by seededFor) and only while the
  // editor is still untouched (draft === saved) and nothing is saved — so it
  // never clobbers in-progress typing or saved content. The seeded draft is
  // intentionally dirty so the PM can review and Save it. Pre-fill, not
  // auto-save: this never writes to the server on its own.
  const [seededFor, setSeededFor] = useState<string | null>(null)
  if (
    suggestion &&
    seededFor !== sectionCode &&
    draft === saved &&
    !saved.trim()
  ) {
    setSeededFor(sectionCode)
    setDraft(suggestion.content ?? "")
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
        <SectionHeader section={section} isRtl={isRtl} />
        <div className="flex-1 overflow-y-auto">
          <div className="px-8 py-6 space-y-5">
            <div
              dir={isRtl ? "rtl" : "ltr"}
              className={cn("rounded-xl border border-slate-200 bg-white p-6", isRtl && "text-right")}
            >
              {saved.trim() ? (
                <ProsePreview content={saved} />
              ) : (
                <p className="text-sm text-slate-400 italic">No content saved.</p>
              )}
            </div>

            <LockedBanner lockedAt={section.locked_at} />

            <div className="flex items-center justify-end">
              <Button
                variant="outline"
                onClick={() => unlock.mutate({ sectionCode })}
                disabled={unlock.isPending}
                className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
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
      <SectionHeader section={section} isRtl={isRtl} />
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 py-6 space-y-5">
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <PenLine className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              This section is written manually and is not AI-generated. Type
              the content below and click Save.
            </span>
          </div>

          {/* Pre-fill notice: shown while the editor holds unsaved suggested
              content seeded from the company's prior data. The copy depends on
              where that content came from — branch on `source`. */}
          {suggestion && dirty && (
            <div className="flex items-start gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
              <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                {suggestion.source === "previous_cycle" ? (
                  <>
                    Pre-filled from
                    {suggestion.fiscal_year
                      ? ` FY${suggestion.fiscal_year}`
                      : " a previous cycle"}
                    . Review and edit before saving.
                  </>
                ) : (
                  <>
                    Seeded from the company profile — please review and rewrite
                    before saving.
                  </>
                )}
              </span>
            </div>
          )}

          <div className="space-y-2">
            <label
              htmlFor="manual-section-content"
              className="text-xs font-semibold uppercase tracking-wide text-slate-400"
            >
              Enter section content
            </label>
            <Textarea
              id="manual-section-content"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write the content for this section…"
              rows={14}
              dir={isRtl ? "rtl" : "ltr"}
              className={cn("rounded-xl text-sm leading-relaxed", isRtl && "text-right")}
            />
            {langWarning && <p className="text-xs text-amber-600">{langWarning}</p>}
            <div className="flex items-center justify-between text-xs">
              {dirty ? (
                <span className="text-amber-600">Unsaved changes</span>
              ) : saved.trim() ? (
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" />
                  Saved
                </span>
              ) : (
                <span className="text-slate-400">Not saved yet</span>
              )}
              <span className="text-slate-400 tabular-nums">{draft.length} chars</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="outline"
              onClick={() => save.mutate({ sectionCode, content: draft })}
              disabled={save.isPending || !dirty || !trimmed || !langOk}
              className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              title={
                !trimmed
                  ? "Add some content before saving"
                  : !langOk
                    ? langWarning ?? undefined
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
              className="bg-indigo-600 text-white hover:bg-indigo-700"
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

// Green "section locked" confirmation banner, shared by the locked views.
export function LockedBanner({ lockedAt }: { lockedAt: string | null }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100">
        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900">Section locked</p>
        <p className="text-xs text-slate-500 mt-0.5">
          Locked on {formatDateTime(lockedAt)}
        </p>
      </div>
    </div>
  )
}
