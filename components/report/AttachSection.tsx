"use client"

import { useDropzone, type FileRejection } from "react-dropzone"
import {
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react"
import { toast } from "sonner"
import { CycleReportSection } from "@/types"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "@/components/report/SectionDetail"
import {
  useAttachUpload,
  useRemoveAttachment,
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
  isRtl = false,
}: {
  section: CycleReportSection
  cycleId: string
  isRtl?: boolean
}) {
  const sectionCode = section.section_code
  const attachment = section.attachment

  const upload = useAttachUpload(cycleId)
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
    disabled: upload.isPending,
    noClick: !!attachment,
    noKeyboard: !!attachment,
  })

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <SectionHeader section={section} isRtl={isRtl} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-8 py-6 space-y-5">
          {attachment ? (
            <AttachedView
              attachment={attachment}
              onReplace={dz.open}
              onRemove={() => remove.mutate({ sectionCode })}
              removing={remove.isPending}
              uploading={upload.isPending}
            />
          ) : (
            <EmptyDropzone dz={dz} uploading={upload.isPending} />
          )}

          {/* Replace flow reuses the same dropzone hook — render an off-screen
              root so `dz.open()` has an input to trigger. */}
          {attachment && (
            <div className="sr-only">
              <div {...dz.getRootProps()}>
                <input {...dz.getInputProps()} />
              </div>
            </div>
          )}
        </div>
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
  onReplace,
  onRemove,
  removing,
  uploading,
}: {
  attachment: NonNullable<CycleReportSection["attachment"]>
  onReplace: () => void
  onRemove: () => void
  removing: boolean
  uploading: boolean
}) {
  const busy = uploading || removing

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
