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
  Trash2,
  Upload,
} from "lucide-react"
import { toast } from "sonner"
import { CycleReportSection } from "@/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { SectionHeader } from "@/components/report/SectionDetail"
import {
  useAttachUpload,
  useLockSection,
  useRemoveAttachment,
  useUnlockSection,
} from "@/hooks/useReportBuilder"
import { cn, formatDateTime, formatFileSize } from "@/lib/utils"

// Regulatory / financial source material — allow spreadsheets too.
const ACCEPT = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "text/plain": [".txt"],
}

export function AttachSection({
  section,
  cycleId,
}: {
  section: CycleReportSection
  cycleId: string
}) {
  const sectionCode = section.section_code
  const isLocked = section.status === "locked"
  const attachment = section.attachment

  // Coerce to boolean — until the backend GET /sections returns `verified`,
  // this field arrives undefined on initial load and would flip a checkbox from
  // uncontrolled to controlled on first click.
  const [verified, setVerified] = useState(section.verified ?? false)
  const [unlockOpen, setUnlockOpen] = useState(false)

  // Reset the verify gate when the server flips us out of locked — React's
  // recommended "store prev value" pattern, not an effect.
  const [prevStatus, setPrevStatus] = useState(section.status)
  if (prevStatus !== section.status) {
    setPrevStatus(section.status)
    if (section.status !== "locked") setVerified(false)
  }

  const upload = useAttachUpload(cycleId)
  const lock = useLockSection(cycleId)
  const unlock = useUnlockSection(cycleId)
  const remove = useRemoveAttachment(cycleId)

  const onDrop = (accepted: File[], rejections: FileRejection[]) => {
    if (rejections.length > 0) {
      toast.error("Unsupported file type. Use PDF, DOCX, DOC, XLSX, or TXT.")
      return
    }
    const file = accepted[0]
    if (!file) return
    upload.mutate({ sectionCode, file })
  }

  // One shared dropzone — `open()` powers the Replace button without rendering
  // a second hidden input.
  const dz = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: false,
    disabled: upload.isPending || isLocked,
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
            <AttachedView
              attachment={attachment}
              verified={verified}
              onVerifiedChange={setVerified}
              onReplace={dz.open}
              onRemove={() => remove.mutate({ sectionCode })}
              onLock={() => lock.mutate({ sectionCode })}
              locking={lock.isPending}
              removing={remove.isPending}
              uploading={upload.isPending}
            />
          ) : (
            <EmptyDropzone dz={dz} uploading={upload.isPending} />
          )}

          {/* Replace flow reuses the same dropzone hook — render an off-screen
              root so `dz.open()` has an input to trigger. */}
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
        description="You'll need to verify it again before re-locking."
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
            ? "Uploading…"
            : dz.isDragActive
              ? "Drop the file to upload"
              : "Drag a file here, or click to browse"}
        </p>
        <p className="text-xs text-muted-foreground">
          PDF, DOCX, DOC, XLSX, or TXT
        </p>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Upload the source document for this section. It will be embedded into the
        report exactly as provided.
      </p>
    </div>
  )
}

function AttachedView({
  attachment,
  verified,
  onVerifiedChange,
  onReplace,
  onRemove,
  onLock,
  locking,
  removing,
  uploading,
}: {
  attachment: NonNullable<CycleReportSection["attachment"]>
  verified: boolean
  onVerifiedChange: (next: boolean) => void
  onReplace: () => void
  onRemove: () => void
  onLock: () => void
  locking: boolean
  removing: boolean
  uploading: boolean
}) {
  const busy = uploading || locking || removing
  const lockDisabled = !verified || busy

  return (
    <div className="space-y-5">
      <FileCard
        attachment={attachment}
        right={
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={onReplace}
              disabled={busy}
              className="h-8 px-2.5 text-xs"
            >
              {uploading ? (
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
              onClick={onRemove}
              disabled={busy}
              className="h-8 px-2.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              {removing ? (
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

      <Checkbox
        id="attach-verify"
        checked={verified}
        onCheckedChange={onVerifiedChange}
        label="I have verified this document against the official source."
        description="Locking the section records this attestation."
        disabled={locking}
      />

      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-xs text-muted-foreground">
          {verified
            ? "Ready to lock."
            : "Confirm verification above to enable lock."}
        </p>
        <Button
          onClick={onLock}
          disabled={lockDisabled}
          title={
            !verified
              ? "Upload a document and confirm verification to lock."
              : undefined
          }
        >
          {locking ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Locking…
            </>
          ) : (
            <>
              <Lock className="h-4 w-4 mr-2" />
              Lock section
            </>
          )}
        </Button>
      </div>
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
  return (
    <div className="space-y-4">
      {attachment && <FileCard attachment={attachment} />}

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
