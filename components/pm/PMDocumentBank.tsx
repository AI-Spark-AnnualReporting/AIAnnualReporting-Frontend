"use client"

import { useState, useMemo } from "react"
import { useKBDocuments } from "@/hooks/useKnowledgeBase"
import { knowledgeBaseApi } from "@/lib/api/knowledge-base"
import { KBDocument, DocumentPurpose } from "@/types"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Download, RefreshCw, FileText } from "lucide-react"
import { formatDate, formatFileSize, cn } from "@/lib/utils"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"

type PurposeFilter = "all" | DocumentPurpose

const PURPOSE_OPTIONS: { value: PurposeFilter; label: string }[] = [
  { value: "all", label: "All Purposes" },
  { value: "kickoff", label: "Kickoff" },
  { value: "reference", label: "Reference" },
  { value: "submission", label: "Submission" },
  { value: "supporting", label: "Supporting" },
  { value: "template", label: "Template" },
]

const FILE_TYPE_COLORS: Record<string, string> = {
  ".pdf": "bg-red-50 text-red-600",
  ".doc": "bg-blue-50 text-blue-600",
  ".docx": "bg-blue-50 text-blue-600",
  ".xls": "bg-emerald-50 text-emerald-600",
  ".xlsx": "bg-emerald-50 text-emerald-600",
  ".csv": "bg-emerald-50 text-emerald-600",
  ".ppt": "bg-orange-50 text-orange-600",
  ".pptx": "bg-orange-50 text-orange-600",
  ".png": "bg-violet-50 text-violet-600",
  ".jpg": "bg-violet-50 text-violet-600",
  ".jpeg": "bg-violet-50 text-violet-600",
  ".gif": "bg-violet-50 text-violet-600",
  ".txt": "bg-slate-100 text-slate-500",
}

// Keyed by normalised purpose ("report attachment", "financial", …). The backend
// emits more purposes than the typed union, so render whatever arrives and fall
// back to indigo for anything unmapped.
const PURPOSE_BADGE_COLORS: Record<string, string> = {
  kickoff: "bg-violet-50 text-violet-700",
  reference: "bg-blue-50 text-blue-700",
  submission: "bg-amber-50 text-amber-700",
  supporting: "bg-emerald-50 text-emerald-700",
  template: "bg-orange-50 text-orange-700",
  financial: "bg-emerald-50 text-emerald-700",
  commentary: "bg-amber-50 text-amber-700",
  "report attachment": "bg-indigo-50 text-indigo-700",
}

function FileTypeIcon({ fileType }: { fileType: string }) {
  const ext = (fileType ?? "").toLowerCase()
  const colorClass = FILE_TYPE_COLORS[ext] ?? "bg-slate-100 text-slate-500"
  const label = ext.replace(".", "").toUpperCase().slice(0, 4) || "FILE"
  return (
    <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[10px] font-bold", colorClass)}>
      {label}
    </div>
  )
}

function PurposeBadge({ purpose }: { purpose: string }) {
  const normalized = purpose.toLowerCase().replace(/[_\s]+/g, " ").trim()
  const color = PURPOSE_BADGE_COLORS[normalized] ?? "bg-indigo-50 text-indigo-700"
  return (
    <span className={cn("shrink-0 rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide", color)}>
      {normalized}
    </span>
  )
}

const PAGE_SIZE = 50

export function PMDocumentBank() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [purposeFilter, setPurposeFilter] = useState<PurposeFilter>("all")
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const { data, isLoading, isFetching } = useKBDocuments({
    document_purpose: purposeFilter === "all" ? undefined : purposeFilter,
    page,
    page_size: PAGE_SIZE,
  })

  const docs = useMemo(() => data?.documents ?? [], [data?.documents])
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const cycleGroups = useMemo(() => {
    const map = new Map<string, { cycleId: string; cycleName: string; docs: KBDocument[] }>()
    for (const doc of docs) {
      const key = doc.cycle_id ?? "__none__"
      if (!map.has(key)) {
        map.set(key, { cycleId: key, cycleName: doc.cycle_name ?? "Uncategorized", docs: [] })
      }
      map.get(key)!.docs.push(doc)
    }
    return Array.from(map.values())
  }, [docs])

  const handleDownload = async (doc: KBDocument) => {
    setDownloadingId(doc.document_id)
    try {
      const response = await knowledgeBaseApi.getDownloadUrl(doc.document_id)
      const a = document.createElement("a")
      a.href = response.download_url
      a.download = response.filename || doc.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {
      toast.error("Failed to get download link")
    } finally {
      setDownloadingId(null)
    }
  }

  const handleRefresh = () => qc.invalidateQueries({ queryKey: ["kb-documents"] })

  const subtitle =
    total > 0
      ? `Every uploaded document grouped by the cycle it belongs to · ${total} ${total === 1 ? "document" : "documents"}.`
      : "Browse and download reference documents for your reporting cycles."

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Document Bank</h1>
          <p className="mt-1.5 text-base text-slate-500">{subtitle}</p>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={isFetching}
          className="shrink-0 border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Filter */}
      <Select
        value={purposeFilter}
        onValueChange={(v) => { setPurposeFilter(v as PurposeFilter); setPage(1) }}
      >
        <SelectTrigger className="w-52 rounded-xl border-slate-200 bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PURPOSE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-5">
          {[1, 2].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl border border-slate-100 bg-white" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && docs.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-100 bg-white py-16 text-center">
          <div className="mb-4 rounded-full bg-slate-100 p-4">
            <FileText className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">No documents found</h3>
          <p className="mt-1 max-w-xs text-sm text-slate-500">
            Documents uploaded through cycles will appear here.
          </p>
        </div>
      )}

      {/* Grouped list */}
      {!isLoading && cycleGroups.length > 0 && (
        <div className="space-y-5">
          {cycleGroups.map((group) => (
            <div key={group.cycleId} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                <h3 className="text-base font-bold text-slate-900">{group.cycleName}</h3>
                <span className="text-sm text-slate-400">
                  {group.docs.length} {group.docs.length === 1 ? "document" : "documents"}
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {group.docs.map((doc) => (
                  <div
                    key={doc.document_id}
                    className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-slate-50/60"
                  >
                    <FileTypeIcon fileType={doc.file_type} />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{doc.filename}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatFileSize(doc.file_size)} · Uploaded {formatDate(doc.created_at)}
                        {doc.uploader_name ? ` · ${doc.uploader_name}` : ""}
                      </p>
                    </div>

                    {doc.document_purpose && <PurposeBadge purpose={doc.document_purpose} />}

                    <Button
                      onClick={() => handleDownload(doc)}
                      disabled={downloadingId === doc.document_id}
                      className="h-9 shrink-0 gap-1.5 bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      <Download className="h-4 w-4" />
                      {downloadingId === doc.document_id ? "…" : "Download"}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-sm text-slate-500">
            Page {page} of {totalPages} ({total} total documents)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isFetching}
              className="border-slate-200 bg-white"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isFetching}
              className="border-slate-200 bg-white"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
