"use client"

import { useState } from "react"
import { useDropzone, type FileRejection } from "react-dropzone"
import {
  CheckCircle2,
  FileText,
  Loader2,
  Lock,
  LockOpen,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ProsePreview } from "@/components/ui/prose-preview"
import { Textarea } from "@/components/ui/textarea"
import { SectionHeader } from "@/components/report/SectionDetail"
import {
  useAttachUpload,
  useLockSection,
  useRemoveAttachment,
  useSetExtractContent,
  useUnlockSection,
} from "@/hooks/useReportBuilder"
import { cn, formatDateTime, formatFileSize } from "@/lib/utils"
import { documentsApi } from "@/lib/api/documents"
import { documentLanguageWarning } from "@/lib/lang"
import { LanguageMismatchAlert } from "@/components/ui/language-mismatch-alert"
import type { ContentLanguage, CycleReportSection } from "@/types"

// Document-driven extraction: uploading the source runs AI extraction on the
// backend and returns the text in `section.content`. The PM reviews/edits it,
// then locks. Locking needs a document attached; the content itself is optional.
const ACCEPT = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/msword": [".doc"],
}

export function ExtractSection({
  section,
  cycleId,
  contentLanguage = "english",
}: {
  section: CycleReportSection
  cycleId: string
  contentLanguage?: ContentLanguage
}) {
  const sectionCode = section.section_code
  const isLocked = section.status === "locked"
  const attachment = section.attachment
  const saved = section.content ?? ""

  const [draft, setDraft] = useState(saved)
  const [unlockOpen, setUnlockOpen] = useState(false)
  // Wrong-language guard: verify the dropped file's language BEFORE uploading,
  // so an extract source in the wrong language is never sent.
  const [langWarning, setLangWarning] = useState<string | null>(null)
  const [checkingLang, setCheckingLang] = useState(false)

  // Re-seed the editor when the server content changes externally — after an
  // upload (extraction result), a remove (cleared), an unlock, or a section
  // switch. React's "store previous value" pattern, not an effect.
  const [prevSaved, setPrevSaved] = useState(saved)
  if (prevSaved !== saved) {
    setPrevSaved(saved)
    setDraft(saved)
  }

  const upload = useAttachUpload(cycleId)
  const save = useSetExtractContent(cycleId)
  const lock = useLockSection(cycleId)
  const unlock = useUnlockSection(cycleId)
  const remove = useRemoveAttachment(cycleId)

  const dirty = draft !== saved

  const onDrop = async (accepted: File[], rejections: FileRejection[]) => {
    if (rejections.length > 0) {
      toast.error("Unsupported file type. Use PDF or DOCX.")
      return
    }
    const file = accepted[0]
    if (!file) return
    // Verify language first — only upload if it matches the cycle's language.
    setLangWarning(null)
    setCheckingLang(true)
    try {
      const res = await documentsApi.checkLanguage(file, contentLanguage)
      if (!res.matches) {
        const detected =
          res.detected_language === "arabic" || res.detected_language === "english"
            ? res.detected_language
            : undefined
        setLangWarning(documentLanguageWarning(contentLanguage, detected))
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
      <SectionHeader section={section} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-6 space-y-5">
          {isLocked ? (
            <LockedView
              section={section}
              onUnlock={() => setUnlockOpen(true)}
              unlocking={unlock.isPending}
            />
          ) : attachment ? (
            <>
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

              {upload.isPending ? (
                <ExtractingNotice />
              ) : (
                <ContentEditor
                  draft={draft}
                  saved={saved}
                  dirty={dirty}
                  extractedEmpty={saved.trim() === ""}
                  saving={save.isPending}
                  locking={lock.isPending}
                  onChange={setDraft}
                  onSave={() => save.mutate({ sectionCode, content: draft })}
                  onLock={() => lock.mutate({ sectionCode })}
                />
              )}
            </>
          ) : (
            <div className="space-y-2.5">
              <LanguageMismatchAlert message={langWarning} />
              <EmptyDropzone dz={dz} uploading={upload.isPending || checkingLang} />
            </div>
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
        description="You can edit the extracted content or replace the document, then re-lock."
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
  saving,
  locking,
  onChange,
  onSave,
  onLock,
}: {
  draft: string
  saved: string
  dirty: boolean
  extractedEmpty: boolean
  saving: boolean
  locking: boolean
  onChange: (next: string) => void
  onSave: () => void
  onLock: () => void
}) {
  const busy = saving || locking
  // Lock requires a document (guaranteed here) but not content. Just don't lock
  // over unsaved edits.
  const lockDisabled = dirty || busy

  return (
    <div className="space-y-2">
      <label
        htmlFor="extract-section-content"
        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Extracted content
      </label>

      {extractedEmpty && !dirty && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            No content extracted from the document — enter it manually below.
          </span>
        </div>
      )}

      <Textarea
        id="extract-section-content"
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          extractedEmpty
            ? "No content extracted — enter manually"
            : "Extracted content…"
        }
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
          <span className="text-muted-foreground">No content yet</span>
        )}
        <span className="text-muted-foreground tabular-nums">
          {draft.length} chars
        </span>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          variant="outline"
          onClick={onSave}
          disabled={saving || !dirty}
          title={!dirty ? "No changes to save" : undefined}
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
          title={dirty ? "Save your changes before locking" : undefined}
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
          "flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/20 px-6 py-10 text-center transition-colors cursor-pointer",
          dz.isDragActive
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/40 hover:bg-muted/40",
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
        <p className="text-xs text-muted-foreground">PDF or DOCX</p>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Upload the source document. We&apos;ll automatically extract the relevant
        content for this section — you can review and edit it before locking.
      </p>
    </div>
  )
}

function LockedView({
  section,
  onUnlock,
  unlocking,
}: {
  section: CycleReportSection
  onUnlock: () => void
  unlocking: boolean
}) {
  const attachment = section.attachment
  const content = section.content ?? ""

  return (
    <div className="space-y-4">
      {attachment && <FileCard attachment={attachment} />}

      <div className="rounded-lg border bg-card p-6">
        {content.trim() ? (
          <ProsePreview content={content} />
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No content extracted.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900/50 dark:bg-green-950/25">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Section locked</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Locked on {formatDateTime(section.locked_at)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end pt-1">
        <Button variant="outline" onClick={onUnlock} disabled={unlocking}>
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
