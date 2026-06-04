"use client"

import { useDropzone, type FileRejection } from "react-dropzone"
import { ImageIcon, Loader2, RefreshCw, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { CycleReportSection } from "@/types"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "@/components/report/SectionDetail"
import { useAttachUpload, useRemoveAttachment } from "@/hooks/useReportBuilder"
import { cn, formatDateTime, formatFileSize } from "@/lib/utils"

// The cover is an auto section, so there's no "lock" step — uploading an image
// is purely optional. When present it becomes the report's front cover; if
// omitted, the backend generates a text cover automatically.
const ACCEPT = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
}

export function CoverSection({
  section,
  cycleId,
}: {
  section: CycleReportSection
  cycleId: string
}) {
  const sectionCode = section.section_code
  const attachment = section.attachment

  const upload = useAttachUpload(cycleId)
  const remove = useRemoveAttachment(cycleId)

  const onDrop = (accepted: File[], rejections: FileRejection[]) => {
    if (rejections.length > 0) {
      toast.error("Unsupported file type. Use a PNG or JPG image.")
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
      <SectionHeader section={section} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-6 space-y-5">
          <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            <ImageIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              Upload a cover image (PNG or JPG) to use as the report&rsquo;s front
              cover. This is optional — if you skip it, a text cover is generated
              automatically.
            </span>
          </div>

          {attachment ? (
            <ImageCard
              attachment={attachment}
              onReplace={dz.open}
              onRemove={() => remove.mutate({ sectionCode })}
              uploading={upload.isPending}
              removing={remove.isPending}
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
              ? "Drop the image to upload"
              : "Drag an image here, or click to browse"}
        </p>
        <p className="text-xs text-muted-foreground">PNG or JPG</p>
      </div>
    </div>
  )
}

function ImageCard({
  attachment,
  onReplace,
  onRemove,
  uploading,
  removing,
}: {
  attachment: NonNullable<CycleReportSection["attachment"]>
  onReplace: () => void
  onRemove: () => void
  uploading: boolean
  removing: boolean
}) {
  const busy = uploading || removing
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/30">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
        <ImageIcon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{attachment.filename}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatFileSize(attachment.file_size)} · uploaded{" "}
          {formatDateTime(attachment.uploaded_at)}
        </p>
      </div>
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
    </div>
  )
}
