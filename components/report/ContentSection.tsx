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
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LanguageMismatchAlert } from "@/components/ui/language-mismatch-alert"
import { ProsePreview } from "@/components/ui/prose-preview"
import { Textarea } from "@/components/ui/textarea"
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
import {
  documentLanguageWarning,
  isLanguageAcceptable,
  languageMismatchWarning,
} from "@/lib/lang"
import type { ContentLanguage, CycleReportSection } from "@/types"

// The two human-authored modes — `manual` (chairman/CEO/auditor statements) and
// `extract` (financial statements, notes, auditor's report) — share this one
// panel. Both accept EITHER input: drop a document and the backend returns its
// extracted text in `section.content`, or just type the body. Either one alone
// is enough to save and lock; an attachment is never required.
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

  const [draft, setDraft] = useState(saved)
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

  // Re-seed the editor when the server content changes externally — after an
  // upload (extraction result), a remove (cleared), an unlock, or a section
  // switch. React's "store previous value" pattern, not an effect.
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

  const upload = useAttachUpload(cycleId)
  const saveExtract = useSetExtractContent(cycleId)
  const saveManual = useSaveManualContent(cycleId)
  const save = isExtract ? saveExtract : saveManual
  const lock = useLockSection(cycleId)
  const unlock = useUnlockSection(cycleId)
  const remove = useRemoveAttachment(cycleId)

  const dirty = draft !== saved
  const uploading = upload.isPending || checkingLang

  // While the previous-content query is in flight for an empty, untouched
  // section, show an interactive loader so the PM knows a pre-fill might be
  // arriving (and doesn't start typing into what's about to be replaced). Only
  // relevant when nothing is saved and the editor is still empty — a populated
  // section never auto-seeds, so there's nothing to wait for.
  const prefilling = previousLoading && !saved.trim() && !draft.trim()

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
    upload.mutate({ sectionCode, file })
  }

  // One shared dropzone — `open()` powers the Replace button without a second
  // hidden input.
  const dz = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: false,
    disabled: upload.isPending || isLocked || checkingLang,
    noClick: !!attachment,
    noKeyboard: !!attachment,
  })

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <SectionHeader section={section} isRtl={isRtl} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-8 py-6 space-y-5">
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
                    This section is written by you and is not AI-generated.
                    Upload a document or type the content below, then Save.
                  </span>
                </div>
              )}

              {/* Pre-fill loader: the previous-content query is still running for
                  an empty section, so a suggestion may be about to seed the
                  editor. Surface it so the PM waits instead of typing into a
                  field that's about to be overwritten. */}
              {prefilling && (
                <div className="flex items-center gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  <span>Checking for previous content to pre-fill…</span>
                </div>
              )}

              {/* Pre-fill notice: shown while the editor holds unsaved suggested
                  content seeded from the company's prior data. The copy depends
                  on where that content came from — branch on `source`. */}
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
                ) : (
                  <EmptyDropzone dz={dz} uploading={uploading} />
                )}
              </div>

              {upload.isPending && <ExtractingNotice />}

              {/* Typing lane. Always mounted too — a PM who never uploads can
                  write the section here and lock it. */}
              <ContentEditor
                draft={draft}
                saved={saved}
                dirty={dirty}
                // The document produced nothing usable — say so instead of
                // leaving an unexplained empty box.
                extractedEmpty={!!attachment && saved.trim() === ""}
                // Disable while the editor is about to be re-seeded — by the
                // pre-fill query or by the extraction now running — so typing
                // can't be silently clobbered.
                disabled={prefilling || upload.isPending}
                prefilling={prefilling}
                saving={save.isPending}
                locking={lock.isPending}
                contentLanguage={contentLanguage}
                isRtl={isRtl}
                onChange={setDraft}
                onSave={() => save.mutate({ sectionCode, content: draft })}
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

function ContentEditor({
  draft,
  saved,
  dirty,
  extractedEmpty,
  disabled,
  prefilling,
  saving,
  locking,
  onChange,
  onSave,
  onLock,
  contentLanguage,
  isRtl,
}: {
  draft: string
  saved: string
  dirty: boolean
  extractedEmpty: boolean
  disabled: boolean
  prefilling: boolean
  saving: boolean
  locking: boolean
  onChange: (next: string) => void
  onSave: () => void
  onLock: () => void
  contentLanguage: ContentLanguage
  isRtl?: boolean
}) {
  const busy = saving || locking
  const trimmed = draft.trim()
  // Content must be in the cycle's language (warn + block Save), like the dept
  // answer box and the kickoff brief.
  const langWarning = languageMismatchWarning(draft, contentLanguage)
  const langOk = isLanguageAcceptable(draft, contentLanguage)
  // The stricter of the two old rules: locking needs saved, non-empty content.
  // A document alone is no longer enough — and never was on the backend, which
  // rejects a lock with empty content.
  const lockDisabled = busy || dirty || !saved.trim()

  return (
    <div className="space-y-2">
      <label
        htmlFor="section-content"
        className="text-xs font-semibold uppercase tracking-wide text-slate-400"
      >
        Section content
      </label>

      {extractedEmpty && !dirty && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            No content extracted from the document — enter it manually below.
          </span>
        </div>
      )}

      <Textarea
        id="section-content"
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          prefilling
            ? "Checking for previous content…"
            : "Write the content for this section, or upload a document above…"
        }
        rows={14}
        dir={isRtl ? "rtl" : "ltr"}
        disabled={disabled}
        className={cn(
          "rounded-xl text-sm leading-relaxed",
          isRtl && "text-right",
        )}
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

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          variant="outline"
          onClick={onSave}
          disabled={saving || !dirty || !trimmed || !langOk}
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
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save
        </Button>
        <Button
          onClick={onLock}
          disabled={lockDisabled}
          className="bg-indigo-600 text-white hover:bg-indigo-700"
          title={
            dirty
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

function EmptyDropzone({
  dz,
  uploading,
}: {
  dz: ReturnType<typeof useDropzone>
  uploading: boolean
}) {
  return (
    <div className="space-y-2.5">
      <div
        {...dz.getRootProps()}
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-slate-50 px-6 py-10 text-center transition-colors cursor-pointer",
          dz.isDragActive
            ? "border-indigo-400 bg-indigo-50"
            : "border-slate-200 hover:border-indigo-300 hover:bg-slate-100/60",
          uploading && "cursor-wait opacity-70",
        )}
      >
        <input {...dz.getInputProps()} />
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-background border">
          {uploading ? (
            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
          ) : (
            <Upload className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <p className="text-sm font-medium mb-0.5">
          {uploading
            ? "Uploading & extracting…"
            : dz.isDragActive
              ? "Drop the file to upload"
              : "Drag a file here, or click to browse"}
        </p>
        <p className="text-xs text-muted-foreground">DOCX</p>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Optional: upload the source document and we&apos;ll pull its text into
        the editor below for you to review. You can skip this and simply write
        the content yourself.
      </p>
    </div>
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
