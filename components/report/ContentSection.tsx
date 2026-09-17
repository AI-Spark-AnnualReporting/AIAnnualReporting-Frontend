"use client"

import { useState } from "react"
import { useDropzone, type FileRejection } from "react-dropzone"
import {
  CheckCircle2,
  FileText,
  Loader2,
  Lock,
  LockOpen,
  PenLine,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LanguageMismatchAlert } from "@/components/ui/language-mismatch-alert"
import { ProsePreview } from "@/components/ui/prose-preview"
import { SectionBodyEditor } from "@/components/report/SectionBodyEditor"
import { SectionHeader } from "@/components/report/SectionDetail"
import { LockedBanner } from "@/components/report/LockedBanner"
import {
  useAttachUpload,
  useLockSection,
  usePreviousManualSections,
  useRemoveAttachment,
  useSaveManualContent,
  useSetExtractContent,
  useUnlockSection,
} from "@/hooks/useReportBuilder"
import { useAuth } from "@/contexts/AuthContext"
import { cn, formatDateTime, formatFileSize } from "@/lib/utils"
import { documentsApi } from "@/lib/api/documents"
import { documentLanguageWarning, languageMismatchWarning } from "@/lib/lang"
import type { ContentLanguage, CycleReportSection } from "@/types"

// The two human-authored modes — `manual` (chairman/CEO/auditor statements) and
// `extract` (financial statements, notes, auditor's report) — share this one
// panel. Both accept EITHER input: drop a document and the backend returns its
// extracted text in `section.content`, or write the body by hand. Either one
// alone is enough to save and lock; an attachment is never required.
//
// Either way the body is Markdown — the extractor emits it, and the PM edits it
// through the same pencil-and-preview editor the AI-written sections use
// (SectionBodyEditor), so there is one editing model across the report.
//
// PDF is excluded on purpose — these sections feed their text layer to the AI
// agent, and scanned PDFs extract poorly. Matches EXTRACT_TEXT_EXTENSIONS.
const ACCEPT = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/msword": [".doc"],
}

export function ContentSection({
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
  const isLocked = section.status === "locked"
  const attachment = section.attachment
  const saved = section.content ?? ""
  // Both content routes behave identically now, but each mode keeps writing to
  // its own existing endpoint — so pick by mode, not by what's on screen.
  const isExtract = section.mode === "extract"

  // Same editing model as the AI-written sections: the body is read-only
  // Markdown until the pencil swaps a textarea over its source.
  const [editing, setEditing] = useState(false)
  // Text the editor opens on when it is NOT the server's — today only the
  // previous-cycle pre-fill. Non-null exactly while that unconfirmed text is on
  // screen, which is what the pre-fill notice keys off too.
  const [seed, setSeed] = useState<string | null>(null)
  const [unlockOpen, setUnlockOpen] = useState(false)
  // Wrong-language guard for uploads: verify the dropped file's language BEFORE
  // uploading, so a source in the wrong language is never sent.
  const [fileLangWarning, setFileLangWarning] = useState<string | null>(null)
  const [checkingLang, setCheckingLang] = useState(false)

  // The company's previous manual content, used to pre-fill empty sections.
  // companyId comes from the authenticated user (/auth/me) — a PM is scoped to
  // their own company. Extract sections have no prior-cycle equivalent, so pass
  // no company id for them: the hook call stays unconditional and the query
  // no-ops (it's `enabled: !!companyId`).
  const { user } = useAuth()
  const { data: previous, isLoading: previousLoading } =
    usePreviousManualSections(
      isExtract ? undefined : user?.company_id,
      contentLanguage,
    )
  const prevSection = previous?.sections.find(
    (s) => s.section_code === sectionCode,
  )
  // Only suggest a pre-fill when there's prior content AND nothing is saved yet.
  const suggestion =
    !saved.trim() && prevSection?.has_data && prevSection.content
      ? prevSection
      : null

  // Close the editor whenever the server's content moves underneath it — an
  // upload's extraction, a Remove, an unlock, or our own save's echo. Whatever
  // is in the textarea was written against text that no longer exists, and an
  // extraction in particular must never be overwritten by a draft that predates
  // it. React's "store previous value" pattern, not an effect.
  const [prevSaved, setPrevSaved] = useState(saved)
  if (prevSaved !== saved) {
    setPrevSaved(saved)
    setEditing(false)
    setSeed(null)
  }

  // Pre-fill an empty section from the company's previous content. Runs once
  // per section (guarded by seededFor) and only while nothing is saved and the
  // editor is closed, so it never lands on top of typing or saved content.
  //
  // With a pencil there is no draft to seed, so the pre-fill OPENS the editor
  // with its text already in it. The PM reads it and saves it — or cancels it —
  // rather than finding it saved behind their back. Pre-fill, not auto-save:
  // this never writes to the server on its own.
  const [seededFor, setSeededFor] = useState<string | null>(null)
  if (suggestion && seededFor !== sectionCode && !editing && !saved.trim()) {
    setSeededFor(sectionCode)
    setSeed(suggestion.content ?? "")
    setEditing(true)
  }

  const upload = useAttachUpload(cycleId)
  const saveExtract = useSetExtractContent(cycleId)
  const saveManual = useSaveManualContent(cycleId)
  const save = isExtract ? saveExtract : saveManual
  const lock = useLockSection(cycleId)
  const unlock = useUnlockSection(cycleId)
  const remove = useRemoveAttachment(cycleId)

  const uploading = upload.isPending || checkingLang

  // While the previous-content query is in flight for an empty section, show an
  // interactive loader so the PM knows a pre-fill might be arriving (and
  // doesn't start writing into what's about to open). Only relevant when
  // nothing is saved and the editor is closed — a populated section never
  // auto-seeds, and an already-open editor blocks the seed, so in both cases
  // there's nothing to wait for.
  const prefilling = previousLoading && !saved.trim() && !editing

  // The server normalises heading depth on save — a `#` or `##` the PM types is
  // stored as `###` — so the preview must end up rendering the echo the hook
  // patched into the cache, never the local draft. Closing the editor here does
  // exactly that; `saved` is already the server's text by the time we return.
  const handleSave = async (next: string) => {
    try {
      await save.mutateAsync({ sectionCode, content: next })
      setSeed(null)
      setEditing(false)
    } catch {
      // The hook owns the message and the cache. Staying in the editor keeps
      // the typed text on screen so the PM can retry rather than retype.
    }
  }

  const onDrop = async (accepted: File[], rejections: FileRejection[]) => {
    if (rejections.length > 0) {
      toast.error("Unsupported file type. Use DOCX.")
      return
    }
    const file = accepted[0]
    if (!file) return
    // Verify language first — only upload if it matches the cycle's language.
    setFileLangWarning(null)
    setCheckingLang(true)
    try {
      const res = await documentsApi.checkLanguage(file, contentLanguage)
      if (!res.matches) {
        const detected =
          res.detected_language === "arabic" ||
          res.detected_language === "english"
            ? res.detected_language
            : undefined
        setFileLangWarning(documentLanguageWarning(contentLanguage, detected))
        return
      }
    } catch {
      // Fail open — let the upload proceed; the backend still extracts.
    } finally {
      setCheckingLang(false)
    }
    // The extraction is about to replace the body wholesale, so stop editing the
    // version it replaces. (Clicking the dropzone blurred the textarea first,
    // which already committed anything the PM had typed.)
    setEditing(false)
    setSeed(null)
    upload.mutate({ sectionCode, file })
  }

  // One shared dropzone — `open()` powers the Replace button without a second
  // hidden input.
  const dz = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: false,
    disabled: upload.isPending || isLocked || checkingLang,
    // The Upload button is the click target now, so the panel never steals a
    // click — it only accepts a dropped file.
    noClick: true,
    noKeyboard: true,
  })

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <SectionHeader section={section} isRtl={isRtl} />
      <div className="flex-1 overflow-y-auto">
        <div
          {...(isLocked ? {} : dz.getRootProps())}
          className={cn(
            // Full width, matching GenerateSection. These panels sit side by
            // side in the same rail and a PM clicks between them, so the column
            // must not resize underneath them. A reading measure would be right
            // for a finished report and is wrong here: this is where Markdown
            // gets written, and the extract sections are full of pipe tables.
            "w-full px-8 py-6 space-y-5",
            dz.isDragActive &&
              "rounded-2xl outline-dashed outline-2 outline-offset-4 outline-indigo-300",
          )}
        >
          {isLocked ? (
            <LockedView
              section={section}
              onUnlock={() => setUnlockOpen(true)}
              unlocking={unlock.isPending}
              isRtl={isRtl}
            />
          ) : (
            <>
              {!isExtract && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  <PenLine className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    This section is written by you, not by AI. Upload a
                    document to pull its text in, or write it yourself.
                  </span>
                </div>
              )}

              {/* Pre-fill loader: the previous-content query is still running
                  for an empty section, so a suggestion may be about to open the
                  editor with last year's text in it. Surface it so the PM waits
                  instead of starting on something that's about to be replaced. */}
              {prefilling && (
                <div className="flex items-center gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  <span>Checking for previous content to pre-fill…</span>
                </div>
              )}

              {/* Pre-fill notice: shown while the editor holds unsaved suggested
                  content seeded from the company's prior data. The copy depends
                  on where that content came from — branch on `source`. */}
              {suggestion && seed !== null && (
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
                        Seeded from the company profile — please review and
                        rewrite before saving.
                      </>
                    )}
                  </span>
                </div>
              )}

              {/* Upload lane. Always on screen, attachment or not — it's one of
                  two independent ways to fill the section, never a gate in
                  front of the editor below. */}
              <div className="space-y-2.5">
                <LanguageMismatchAlert message={fileLangWarning} />
                {attachment ? (
                  <FileCard
                    attachment={attachment}
                    right={
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={dz.open}
                          disabled={upload.isPending || remove.isPending}
                          className="h-8 px-2.5 text-xs"
                          title="Replace document — extraction re-runs"
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
                          onClick={() => remove.mutate({ sectionCode })}
                          disabled={upload.isPending || remove.isPending}
                          className="h-8 px-2.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          {remove.isPending ? (
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
                ) : null}
              </div>

              {upload.isPending && <ExtractingNotice />}

              {/* Writing lane. Always on screen too — a PM who never uploads
                  can write the section here and lock it. */}
              <ContentBody
                uploadSlot={
                  attachment ? null : (
                    <UploadButton dz={dz} uploading={uploading} />
                  )
                }
                saved={saved}
                seed={seed}
                editing={editing}
                // The document produced nothing usable — say so instead of
                // leaving an unexplained empty box.
                extractedEmpty={!!attachment && saved.trim() === ""}
                // No pencil while the body is about to change under it — the
                // pre-fill query may still open the editor itself, and an
                // extraction is on its way in.
                prefilling={prefilling}
                uploading={uploading}
                saving={save.isPending}
                locking={lock.isPending}
                contentLanguage={contentLanguage}
                isRtl={isRtl}
                onEdit={() => setEditing(true)}
                onSave={handleSave}
                onCancel={() => {
                  setSeed(null)
                  setEditing(false)
                }}
                onLock={() => lock.mutate({ sectionCode })}
              />
            </>
          )}

          {/* Replace flow reuses the dropzone hook — render an off-screen root
              so `dz.open()` has an input to trigger. */}
          {attachment && !isLocked && (
            <div className="sr-only">
              <div {...dz.getRootProps()}>
                <input {...dz.getInputProps()} />
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={unlockOpen}
        onOpenChange={setUnlockOpen}
        title="Unlock this section?"
        description="You can edit the content or replace the document, then re-lock."
        confirmLabel="Unlock"
        variant="destructive"
        isLoading={unlock.isPending}
        onConfirm={async () => {
          await unlock.mutateAsync({ sectionCode })
          setUnlockOpen(false)
        }}
      />
    </div>
  )
}

function ContentBody({
  saved,
  seed,
  editing,
  extractedEmpty,
  prefilling,
  uploading,
  saving,
  locking,
  onEdit,
  onSave,
  onCancel,
  onLock,
  contentLanguage,
  isRtl,
  uploadSlot,
}: {
  saved: string
  seed: string | null
  editing: boolean
  extractedEmpty: boolean
  prefilling: boolean
  uploading: boolean
  saving: boolean
  locking: boolean
  onEdit: () => void
  onSave: (content: string) => void
  onCancel: () => void
  onLock: () => void
  contentLanguage: ContentLanguage
  isRtl?: boolean
  /** The Upload button, rendered in the toolbar beside Edit. */
  uploadSlot?: React.ReactNode
}) {
  const busy = saving || locking || uploading
  // The stricter of the two old rules: locking needs saved, non-empty content.
  // A document alone is no longer enough — and never was on the backend, which
  // rejects a lock with empty content. `editing` stands in for the old
  // long-lived `dirty`: with a pencil, the only unsaved text there can be is
  // inside an open editor. Disabled rather than hidden, so Save-then-Lock stays
  // visible as an order rather than as a button that appears out of nowhere.
  const lockDisabled = busy || editing || !saved.trim()

  return (
    <div className="space-y-2">
      {/* One toolbar for the whole section: what state it's in on the left,
          both ways to fill it on the right. The upload used to be a separate
          hero block above; it belongs beside Edit, because they are two routes
          to the same box rather than two stages. */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">
          {editing ? "Editing the source text" : "Section content"}
        </p>
        {!editing && (
          <div className="flex items-center gap-2">
            {saved.trim() ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 className="h-3 w-3" />
                Saved
              </span>
            ) : null}
            {uploadSlot}
            <Button
              variant="outline"
              size="sm"
              onClick={onEdit}
              disabled={busy || prefilling}
              className="h-8 gap-1.5 border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              <Pencil className="h-3.5 w-3.5" />
              {saved.trim() ? "Edit" : "Write"}
            </Button>
          </div>
        )}
      </div>

      {extractedEmpty && !editing && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            No content extracted from the document — use the pencil to enter it
            manually.
          </span>
        </div>
      )}

      {/* Same box in both states, so the text doesn't jump between the rendered
          preview and its Markdown source. Uploads arrive as Markdown too now
          (### headings, - lists, **bold**), which is exactly why the default is
          the preview and not the raw text. */}
      <div
        dir={isRtl ? "rtl" : "ltr"}
        className={cn(
          // Tall by default. This is the work surface — a PM reads and rewrites
          // a section many times over and uploads to it once, so it gets the
          // height, and an empty one is an invitation rather than a stub.
          "flex min-h-[24rem] w-full flex-col rounded-xl border border-slate-200 bg-white p-8",
          isRtl && "text-right",
        )}
      >
        {editing ? (
          <SectionBodyEditor
            // A pre-fill opens on text the server does not hold: show it, but
            // measure "changed" against the server's own (empty) content so
            // Save works even if the PM accepts it word for word.
            value={seed ?? saved}
            baseline={saved}
            autoFocus={seed === null}
            saving={saving}
            isRtl={!!isRtl}
            placeholder={
              "Write the content for this section, or upload a document above…"
            }
            // Content must be in the cycle's language (warn + block Save), like
            // the dept answer box and the kickoff brief.
            warn={(text) => languageMismatchWarning(text, contentLanguage)}
            onSave={onSave}
            onCancel={onCancel}
          />
        ) : saved.trim() ? (
          <ProsePreview content={saved} />
        ) : (
          // An empty screen is an invitation to act, so it carries the action
          // rather than describing where to find it. The old copy had to teach
          // the control — "use the pencil" — which is the tell that the control
          // was in the wrong place.
          <button
            type="button"
            onClick={onEdit}
            disabled={busy || prefilling}
            className="group flex flex-1 flex-col items-center justify-center gap-3 rounded-lg text-center transition-colors hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:pointer-events-none disabled:opacity-60"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition-colors group-hover:border-indigo-200 group-hover:text-indigo-500">
              <PenLine className="h-5 w-5" />
            </span>
            <span className="text-sm font-medium text-slate-700">
              Write this section
            </span>
            <span className="max-w-xs text-xs leading-relaxed text-slate-400">
              Or upload a Word document and we&apos;ll pull its text in here for
              you to edit.
            </span>
          </button>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          onClick={onLock}
          disabled={lockDisabled}
          className="bg-indigo-600 text-white hover:bg-indigo-700"
          title={
            editing
              ? "Save your changes before locking"
              : !saved.trim()
                ? "Save some content first"
                : undefined
          }
        >
          {locking ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Lock className="h-4 w-4 mr-2" />
          )}
          Lock section
        </Button>
      </div>
    </div>
  )
}

function ExtractingNotice() {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          Extracting content…
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Reading the document and pulling out the relevant text.
        </p>
      </div>
    </div>
  )
}

// No document yet. This used to be a 350px dashed hero for an action most
// sections take once and many never take at all, which pushed the writing area
// — the actual work — into a short box below the fold. It is a button now.
// Drag-and-drop still works, over the whole panel rather than over a target you
// have to aim at; the input stays mounted so dz.open() has something to click.
function UploadButton({
  dz,
  uploading,
}: {
  dz: ReturnType<typeof useDropzone>
  uploading: boolean
}) {
  return (
    <>
      <input {...dz.getInputProps()} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={dz.open}
        disabled={uploading}
        className="h-8 gap-1.5 border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      >
        {uploading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Extracting…
          </>
        ) : (
          <>
            <Upload className="h-3.5 w-3.5" />
            Upload a document
          </>
        )}
      </Button>
    </>
  )
}

function LockedView({
  section,
  onUnlock,
  unlocking,
  isRtl,
}: {
  section: CycleReportSection
  onUnlock: () => void
  unlocking: boolean
  isRtl?: boolean
}) {
  const attachment = section.attachment
  const content = section.content ?? ""

  return (
    <div className="space-y-4">
      {attachment && <FileCard attachment={attachment} />}

      <div
        dir={isRtl ? "rtl" : "ltr"}
        className={cn(
          "rounded-xl border border-slate-200 bg-white p-6",
          isRtl && "text-right",
        )}
      >
        {content.trim() ? (
          <ProsePreview content={content} />
        ) : (
          <p className="text-sm text-slate-400 italic">No content saved.</p>
        )}
      </div>

      <LockedBanner lockedAt={section.locked_at} />

      <div className="flex items-center justify-end pt-1">
        <Button
          variant="outline"
          onClick={onUnlock}
          disabled={unlocking}
          className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        >
          {unlocking ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <LockOpen className="h-4 w-4 mr-2" />
          )}
          Unlock
        </Button>
      </div>
    </div>
  )
}

function FileCard({
  attachment,
  right,
}: {
  attachment: NonNullable<CycleReportSection["attachment"]>
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/30">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
        <FileText className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{attachment.filename}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatFileSize(attachment.file_size)} · uploaded{" "}
          {formatDateTime(attachment.uploaded_at)}
        </p>
      </div>
      {right}
    </div>
  )
}
