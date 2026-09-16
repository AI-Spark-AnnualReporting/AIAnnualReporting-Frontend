"use client"

import { useState } from "react"
import { useDropzone, type FileRejection } from "react-dropzone"
import { toast } from "sonner"
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  Lock,
  LockOpen,
  PenLine,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Textarea } from "@/components/ui/textarea"
import { ProsePreview } from "@/components/ui/prose-preview"
import { SectionHeader } from "@/components/report/SectionDetail"
import {
  isAssistedStatement,
  StatementSourcePicker,
  type DraftOptionState,
  type StatementSource,
} from "@/components/report/StatementSourcePicker"
import {
  useAttachUpload,
  useDraftAvailability,
  useDraftStatement,
  useLockSection,
  usePreviousManualSections,
  useRemoveAttachment,
  useSaveManualContent,
  useUnlockSection,
} from "@/hooks/useReportBuilder"
import { useAuth } from "@/contexts/AuthContext"
import { cn, formatDateTime, formatFileSize } from "@/lib/utils"
import { languageMismatchWarning, isLanguageAcceptable } from "@/lib/lang"
import type { AttachmentInfo, ContentLanguage, CycleReportSection } from "@/types"

// A statement someone signs is not a spreadsheet — narrower than the attach
// section's list on purpose.
const ACCEPT = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/msword": [".doc"],
  "text/plain": [".txt"],
}

// What the panel is showing. "auto" means "whatever the section's own state
// implies" — a document, saved text, or the choice of sources when it has
// neither. The other two are the PM overriding that for this visit: they asked
// to see the choices again, or picked the editor before there is anything in it.
type PanelView = "auto" | "picker" | "editor"

// A pending destructive action, held until the PM confirms it. Source switches
// are confirmed at the moment the text or the file would actually go — not when
// the choices are merely revealed, which costs nothing.
type PendingConfirm =
  | { kind: "source"; source: StatementSource }
  | { kind: "removeDoc" }

// Manual section editor. The PM provides the content; AI never writes it on its
// own. Rendered when `section.ai_allowed === false`.
//
// Two shapes live here:
//   - the five ordinary manual sections (about_company, audit_committee_rec,
//     auditor_reservations, auditor_change, shariah_board_report) open on the
//     editor, silently pre-filled from the company's previous cycle;
//   - the two human-voice statements (Chairman's Statement, CEO's Review) open
//     on a choice of sources instead, and skip the pre-fill entirely — the
//     choice is the front door, so seeding the editor behind it would put words
//     in the section nobody asked for. The suggestion is one of those sources
//     only when the server says a draft is possible.
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
  const assisted = isAssistedStatement(sectionCode)
  const attachment = section.attachment
  const isLocked = section.status === "locked"

  const [draft, setDraft] = useState(saved)
  // Content must be in the cycle's language (warn + block Save), like the dept
  // answer box and the kickoff brief.
  const langWarning = languageMismatchWarning(draft, contentLanguage)
  const langOk = isLanguageAcceptable(draft, contentLanguage)

  // The company's previous manual content, used to pre-fill empty sections.
  // companyId comes from the authenticated user (/auth/me) — a PM is scoped to
  // their own company. The query no-ops until the user (and id) resolve, and is
  // never asked for at all on the two assisted statements, which don't pre-fill.
  const { user } = useAuth()
  const { data: previous, isLoading: previousLoading } =
    usePreviousManualSections(assisted ? null : user?.company_id, contentLanguage)
  const prevSection = previous?.sections.find(
    (s) => s.section_code === sectionCode,
  )
  // Only suggest a pre-fill when there's prior content AND nothing is saved yet.
  const suggestion =
    !assisted && !saved.trim() && prevSection?.has_data && prevSection.content
      ? prevSection
      : null

  // Re-seed the draft when the server content changes externally (e.g. after
  // unlocking, after an upload clears the text, or switching sections in the
  // builder).
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
  const upload = useAttachUpload(cycleId)
  const removeDoc = useRemoveAttachment(cycleId)
  const drafter = useDraftStatement(cycleId)

  const [view, setView] = useState<PanelView>("auto")
  // True while the text sitting in the editor came from the drafting endpoint
  // rather than from the person. Drives the "this is a draft" attribution, and
  // is deliberately session-only: the backend stores no provenance, so claiming
  // it after a reload would be an invention.
  const [drafted, setDrafted] = useState(false)
  const [confirming, setConfirming] = useState<PendingConfirm | null>(null)

  const dirty = draft !== saved
  const trimmed = draft.trim()
  const hasSaved = !!saved.trim()
  const hasDoc = !!attachment
  // Anything a source switch would overwrite: what's saved, and what is sitting
  // unsaved in the editor right now.
  const hasText = hasSaved || !!trimmed

  // While the previous-content query is in flight for an empty, untouched
  // section, show an interactive loader so the PM knows a pre-fill might be
  // arriving (and doesn't start typing into what's about to be replaced). Only
  // relevant when nothing is saved and the editor is still empty — a populated
  // section never auto-seeds, so there's nothing to wait for.
  const prefilling = previousLoading && !hasSaved && !trimmed

  // The drafting endpoint saves nothing, so its answer is read straight off the
  // mutation. "Not enough material yet" is a legitimate answer, so it gets an
  // explanation rather than the failure treatment.
  const draftError = drafter.error as
    | { message?: string; status?: number }
    | null
  // If the backend states the refusal as a status rather than an empty 200, it
  // will be a 409/422 — show its sentence, not a red failure.
  const refusedForMaterial =
    !!draftError && (draftError.status === 409 || draftError.status === 422)
  const noMaterial =
    (!!drafter.data && !drafter.data.content) || refusedForMaterial
  const noMaterialReason = refusedForMaterial
    ? draftError?.message
    : drafter.data?.reason
  const draftFailed = !!draftError && !refusedForMaterial

  const busy =
    save.isPending ||
    lock.isPending ||
    upload.isPending ||
    removeDoc.isPending ||
    drafter.isPending

  const runDraft = () => {
    drafter.mutate(
      { sectionCode },
      {
        onSuccess: (result) => {
          // No content is the "not enough material" answer — leave the panel
          // where it is and let the explanation render.
          if (!result.content) return
          setDraft(result.content)
          setDrafted(true)
          setView("editor")
        },
      },
    )
  }

  const onDrop = (accepted: File[], rejections: FileRejection[]) => {
    if (rejections.length > 0) {
      toast.error("Unsupported file type. Use PDF, DOCX, DOC, or TXT.")
      return
    }
    const file = accepted[0]
    if (!file) return
    upload.mutate(
      { sectionCode, file },
      {
        onSuccess: () => {
          // The upload clears the section's text server-side, so hand the panel
          // back to the section's own state — which is now "has a document".
          setDrafted(false)
          setView("auto")
        },
      },
    )
  }

  // One dropzone, opened programmatically from the picker card and from
  // Replace. Its root is rendered off-screen — there is no drop target on
  // screen, so `noClick`/`noKeyboard` keep it from swallowing stray clicks.
  const dz = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: false,
    disabled: upload.isPending || isLocked,
    noClick: true,
    noKeyboard: true,
  })

  // Which picks would destroy something that is already there.
  const isDestructive = (source: StatementSource): boolean => {
    // Saving typed text deletes the uploaded file (one source at a time).
    if (source === "write") return hasDoc
    // Uploading clears the section's text.
    if (source === "upload") return hasText
    // A fresh draft replaces whichever source is in place.
    return hasText || hasDoc
  }

  const chooseSource = (source: StatementSource) => {
    if (isDestructive(source)) {
      setConfirming({ kind: "source", source })
      return
    }
    applySource(source)
  }

  const applySource = (source: StatementSource) => {
    setConfirming(null)
    if (source === "draft") {
      runDraft()
      return
    }
    // Anything else is a fresh start: clear a stale "not enough material" or
    // failure notice so it doesn't hang over the lane the PM just picked.
    drafter.reset()
    if (source === "write") {
      setDrafted(false)
      setView("editor")
      return
    }
    dz.open()
  }

  // Which pane the body shows. Non-assisted sections have only ever had one.
  const pane: "picker" | "editor" | "document" = !assisted
    ? "editor"
    : view === "auto"
      ? hasDoc
        ? "document"
        : hasSaved
          ? "editor"
          : "picker"
      : view

  // Can this statement be drafted at all? Asked once the picker is actually on
  // screen, and only for the two assisted codes — never on a plain manual
  // section, never on a locked one, and never merely because this panel
  // mounted. The answer is cached per section, so flipping between the picker
  // and the editor doesn't re-ask.
  const availability = useDraftAvailability(
    cycleId,
    sectionCode,
    assisted && !isLocked && pane === "picker",
  )

  // Unknown until it answers, and the picker holds its cards until then rather
  // than show a suggestion it may have to take away.
  //
  // A FAILED check reads as available: a network blip must not silently remove
  // a feature, and the draft endpoint refuses gracefully anyway, so the cost of
  // being wrong in that direction is one explained refusal.
  const draftOption: DraftOptionState = availability.isError
    ? "available"
    : availability.data
      ? availability.data.available
        ? "available"
        : "unavailable"
      : "checking"

  // The editor offers the same suggestion from its own button. Withdraw it only
  // on a definite "no" that we already hold — if the check never ran (the PM
  // landed straight in the editor because the section already had content),
  // leave the button alone and let the refusal path cover it. Nothing here
  // fetches.
  const draftUnavailable = availability.data?.available === false

  if (isLocked) {
    return (
      <div className="flex flex-1 flex-col min-h-0">
        <SectionHeader section={section} isRtl={isRtl} />
        <div className="flex-1 overflow-y-auto">
          <div className="px-8 py-6 space-y-5">
            {attachment ? (
              <DocumentCard attachment={attachment} />
            ) : (
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
            )}

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
          {/* The compliance note belongs to the five sections AI never touches.
              The two assisted statements can now hold a draft the app wrote, so
              claiming "not AI-generated" there would be false. */}
          {!assisted && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              <PenLine className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                This section is written manually and is not AI-generated. Type
                the content below and click Save.
              </span>
            </div>
          )}

          {/* Pre-fill loader: the previous-content query is still running for an
              empty section, so a suggestion may be about to seed the editor.
              Surface it so the PM waits instead of typing into a field that's
              about to be overwritten. */}
          {prefilling && (
            <div className="flex items-center gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              <span>Checking for previous content to pre-fill…</span>
            </div>
          )}

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

          {/* The drafting attempt's state, above whichever pane is showing —
              the PM can ask for a draft from the picker or from the editor, so
              the answer has to be visible in both. */}
          {drafter.isPending && (
            <Notice tone="indigo" icon={Loader2} spin title="Writing the draft">
              Reading this cycle&apos;s material and writing a first version.
              This usually takes under a minute.
            </Notice>
          )}
          {!drafter.isPending && noMaterial && (
            <Notice tone="slate" icon={AlertCircle} title="Not enough to draft from yet">
              {noMaterialReason ??
                "There isn't enough material in this cycle to write this statement from. Write it yourself, upload a document, or come back once more has been submitted."}
            </Notice>
          )}
          {!drafter.isPending && draftFailed && (
            <Notice
              tone="amber"
              icon={AlertCircle}
              title="The draft didn't come back"
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={runDraft}
                  className="shrink-0 border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                >
                  Try again
                </Button>
              }
            >
              {draftError?.message ?? "Something went wrong on the way to the server."}{" "}
              Nothing in this section has changed.
            </Notice>
          )}

          {pane === "picker" && (
            <StatementSourcePicker
              hasExisting={hasText || hasDoc}
              drafting={drafter.isPending}
              busy={busy}
              draftOption={draftOption}
              onChoose={chooseSource}
              onKeep={() => setView("auto")}
            />
          )}

          {pane === "document" && attachment && (
            <div className="space-y-4">
              <DocumentCard
                attachment={attachment}
                right={
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={dz.open}
                      disabled={busy}
                      className="h-8 px-2.5 text-xs"
                    >
                      {upload.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 mr-1" />
                          Replace
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirming({ kind: "removeDoc" })}
                      disabled={busy}
                      className="h-8 px-2.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      {removeDoc.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Remove
                        </>
                      )}
                    </Button>
                  </div>
                }
              />
              <p className="text-xs text-slate-500">
                This document goes into the report as it is. Remove it to write
                the section instead.
              </p>
              <div className="flex items-center justify-between gap-2 pt-1">
                <Button
                  variant="ghost"
                  onClick={() => setView("picker")}
                  disabled={busy}
                  className="text-slate-600 hover:bg-slate-100"
                >
                  Change source
                </Button>
                <Button
                  onClick={() => lock.mutate({ sectionCode })}
                  disabled={busy}
                  className="bg-indigo-600 text-white hover:bg-indigo-700"
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
          )}

          {pane === "editor" && (
            <>
              {/* Attribution. A drafted statement is a starting point someone
                  still has to stand behind — say so plainly, next to the text. */}
              {assisted && drafted && (
                <Notice
                  tone="indigo"
                  icon={Sparkles}
                  title="A draft to review, not a finished statement"
                >
                  We wrote this from the material in this cycle. Check every
                  claim and edit it into your own words before it goes in the
                  report.
                </Notice>
              )}

              <div className="space-y-2">
                <label
                  htmlFor="manual-section-content"
                  className="text-xs font-semibold uppercase tracking-wide text-slate-400"
                >
                  {assisted ? "Statement" : "Enter section content"}
                </label>
                <Textarea
                  id="manual-section-content"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={
                    prefilling
                      ? "Checking for previous content…"
                      : "Write the content for this section…"
                  }
                  rows={14}
                  dir={isRtl ? "rtl" : "ltr"}
                  // Lock the editor while the pre-fill query is in flight so the PM
                  // can't start typing into a field that's about to be seeded — which
                  // would otherwise silently drop the suggestion (the auto-seed only
                  // fires while the editor is still empty). Same during a draft,
                  // which is about to land in this box.
                  disabled={prefilling || drafter.isPending}
                  className={cn("rounded-xl text-sm leading-relaxed", isRtl && "text-right")}
                />
                {langWarning && <p className="text-xs text-amber-600">{langWarning}</p>}
                <div className="flex items-center justify-between text-xs">
                  {dirty ? (
                    <span className="text-amber-600">Unsaved changes</span>
                  ) : hasSaved ? (
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

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  {assisted && (
                    <>
                      <Button
                        variant="ghost"
                        onClick={() => setView("picker")}
                        disabled={busy}
                        className="text-slate-600 hover:bg-slate-100"
                      >
                        Change source
                      </Button>
                      {!draftUnavailable && (
                        <Button
                          variant="outline"
                          onClick={() => chooseSource("draft")}
                          disabled={busy}
                          className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        >
                          {drafter.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4 mr-2" />
                          )}
                          {drafted ? "Draft it again" : "Draft it for me"}
                        </Button>
                      )}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
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
                    disabled={lock.isPending || !hasSaved || dirty}
                    className="bg-indigo-600 text-white hover:bg-indigo-700"
                    title={
                      dirty
                        ? "Save your changes before locking"
                        : !hasSaved
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
            </>
          )}

          {/* The file input lives off-screen: both Choose a file and Replace
              open it through `dz.open()`, so there is no visible drop target to
              render. */}
          {assisted && (
            <div className="sr-only">
              <div {...dz.getRootProps()}>
                <input {...dz.getInputProps()} />
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={confirmTitle(confirming)}
        description={confirmDescription(confirming, hasText)}
        confirmLabel={confirmLabel(confirming)}
        variant="destructive"
        isLoading={removeDoc.isPending || drafter.isPending}
        onConfirm={async () => {
          if (!confirming) return
          if (confirming.kind === "removeDoc") {
            await removeDoc.mutateAsync({ sectionCode })
            setDrafted(false)
            setView("auto")
            setConfirming(null)
            return
          }
          applySource(confirming.source)
        }}
      />
    </div>
  )
}

function confirmTitle(pending: PendingConfirm | null): string {
  if (!pending) return ""
  if (pending.kind === "removeDoc") return "Remove this document?"
  if (pending.source === "draft") return "Replace this with a new draft?"
  if (pending.source === "upload") return "Replace this text with a document?"
  return "Write this section instead?"
}

function confirmDescription(
  pending: PendingConfirm | null,
  hasText: boolean,
): string {
  if (!pending) return ""
  if (pending.kind === "removeDoc") {
    return "The file is deleted from this section and you'll be back to the choices."
  }
  if (pending.source === "draft") {
    return hasText
      ? "The text in this section is replaced by a new draft written from this cycle's material."
      : "The new draft replaces the uploaded document once you save it."
  }
  if (pending.source === "upload") {
    return "Uploading a file clears the text saved in this section. That can't be undone."
  }
  return "Saving your own text removes the document uploaded to this section."
}

function confirmLabel(pending: PendingConfirm | null): string {
  if (!pending) return "Confirm"
  if (pending.kind === "removeDoc") return "Remove"
  if (pending.source === "draft") return "Write a new draft"
  if (pending.source === "upload") return "Choose a file"
  return "Open the editor"
}

// One uploaded document, with whatever controls the caller needs beside it.
function DocumentCard({
  attachment,
  right,
}: {
  attachment: AttachmentInfo
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100">
        <FileText className="h-5 w-5 text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate text-slate-900">
          {attachment.filename}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          {formatFileSize(attachment.file_size)} · uploaded{" "}
          {formatDateTime(attachment.uploaded_at)}
        </p>
      </div>
      {right}
    </div>
  )
}

// A titled line of explanation, in the panel's three tones.
function Notice({
  tone,
  icon: Icon,
  spin = false,
  title,
  action,
  children,
}: {
  tone: "indigo" | "amber" | "slate"
  icon: typeof Sparkles
  spin?: boolean
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  const skin = {
    indigo: { box: "border-indigo-200 bg-indigo-50", head: "text-indigo-900", body: "text-indigo-700", icon: "text-indigo-500" },
    amber: { box: "border-amber-200 bg-amber-50", head: "text-amber-900", body: "text-amber-700", icon: "text-amber-600" },
    slate: { box: "border-slate-200 bg-slate-50", head: "text-slate-900", body: "text-slate-500", icon: "text-slate-400" },
  }[tone]

  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl border px-4 py-3", skin.box)}>
      <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", skin.icon, spin && "animate-spin")} />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", skin.head)}>{title}</p>
        <p className={cn("mt-0.5 text-xs leading-relaxed", skin.body)}>{children}</p>
      </div>
      {action}
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
