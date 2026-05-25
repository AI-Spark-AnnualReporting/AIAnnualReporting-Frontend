"use client"

import { useState } from "react"
import { Download, ExternalLink, FileText, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ProsePreview } from "@/components/ui/prose-preview"
import { knowledgeBaseApi } from "@/lib/api/knowledge-base"
import { cn, formatFileSize } from "@/lib/utils"
import type { FinalReportSection } from "@/types"

interface ReportSectionRendererProps {
  section: FinalReportSection
  index: number
}

// Renders one body section of the final report. Switches on section.type:
//  - narrative → title + prose
//  - attachment → title + document card with View / Download
//  - auto → caller filters these out (cover/TOC are bespoke)
export function ReportSectionRenderer({
  section,
  index,
}: ReportSectionRendererProps) {
  return (
    <section
      id={section.section_code}
      className={cn(
        "scroll-mt-24",
        index > 0 && "print:break-before-page",
      )}
    >
      <SectionTitle title={section.title} index={index} />
      {section.type === "narrative" ? (
        section.content && section.content.trim() ? (
          <ProsePreview content={section.content} />
        ) : (
          <p className="text-sm text-muted-foreground italic">
            This section has no content.
          </p>
        )
      ) : section.type === "attachment" && section.document ? (
        <AttachmentCard document={section.document} />
      ) : (
        <p className="text-sm text-muted-foreground italic">
          Section content not available.
        </p>
      )}
    </section>
  )
}

function SectionTitle({ title, index }: { title: string; index: number }) {
  return (
    <h2 className="text-2xl font-semibold mb-4 flex items-baseline gap-3">
      <span className="text-muted-foreground tabular-nums text-base font-normal">
        {String(index + 1).padStart(2, "0")}
      </span>
      <span>{title}</span>
    </h2>
  )
}

function AttachmentCard({
  document,
}: {
  document: NonNullable<FinalReportSection["document"]>
}) {
  const [loading, setLoading] = useState<"view" | "download" | null>(null)

  const fetchUrl = async (): Promise<string | null> => {
    try {
      const res = await knowledgeBaseApi.getDownloadUrl(document.document_id)
      return res.download_url
    } catch {
      toast.error("Couldn't fetch the document link")
      return null
    }
  }

  const onView = async () => {
    setLoading("view")
    const url = await fetchUrl()
    setLoading(null)
    if (url) window.open(url, "_blank", "noopener,noreferrer")
  }

  const onDownload = async () => {
    setLoading("download")
    const url = await fetchUrl()
    setLoading(null)
    if (!url) return
    const a = window.document.createElement("a")
    a.href = url
    a.download = document.filename
    window.document.body.appendChild(a)
    a.click()
    window.document.body.removeChild(a)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-muted">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{document.filename}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {(document.file_type || "Document").toUpperCase().replace(/^\./, "")}
            {document.file_size ? ` · ${formatFileSize(document.file_size)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0 print:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={onView}
            disabled={loading !== null}
            className="h-8 px-2.5 text-xs"
          >
            {loading === "view" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                View
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDownload}
            disabled={loading !== null}
            className="h-8 px-2.5 text-xs"
          >
            {loading === "download" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Download className="h-3.5 w-3.5 mr-1" />
                Download
              </>
            )}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground italic">
        Audited document — included as filed.
      </p>
      {/* Print-only reference line so the printed PDF honestly reflects the
          v1 limitation: financials aren't bound into the printed document. */}
      <p className="hidden print:block text-xs text-muted-foreground">
        Provided as a separate file: <strong>{document.filename}</strong>
      </p>
    </div>
  )
}
