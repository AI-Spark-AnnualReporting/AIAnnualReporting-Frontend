"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Download, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { documentsApi } from "@/lib/api/documents"
import type { ClientSupportingDocument } from "@/lib/api/share"

/**
 * The supporting documents a client attached on a department link, each with
 * a Download button. Shown to the HOD (reviewing the client's reply) and to
 * the department user (after Assign).
 *
 * Plan: AIAnnualReporting/.claude/plans/client-supporting-documents.md
 */
export function ClientDocumentsList({ documents }: { documents: ClientSupportingDocument[] }) {
  // The file being fetched, so only its button spins.
  const [openingId, setOpeningId] = useState<string | null>(null)

  /** Open one file. The signed URL expires, so it is fetched on each click. */
  const download = async (documentId: string) => {
    setOpeningId(documentId)
    try {
      const { download_url } = await documentsApi.getDownloadUrl(documentId)
      window.open(download_url, "_blank", "noopener,noreferrer")
    } catch {
      toast.error("Couldn't open that file. Try again in a moment.")
    } finally {
      setOpeningId(null)
    }
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-background">
      {documents.map((doc) => (
        <li key={doc.id} className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <FileText className="h-4 w-4 shrink-0 text-indigo-600" />
            <span className="truncate">{doc.filename}</span>
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={openingId === doc.id}
            onClick={() => download(doc.id)}
          >
            {openingId === doc.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download
          </Button>
        </li>
      ))}
    </ul>
  )
}
