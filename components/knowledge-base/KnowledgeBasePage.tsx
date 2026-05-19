"use client"

import { useState, useMemo } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useKBDocuments } from "@/hooks/useKnowledgeBase"
import { knowledgeBaseApi } from "@/lib/api/knowledge-base"
import { KBDocument, DocumentPurpose } from "@/types"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Download, RefreshCw, FileText } from "lucide-react"
import { formatDate, formatFileSize } from "@/lib/utils"
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

const EMPTY_STATE_MESSAGES: Record<string, string> = {
  admin: "No documents in the system yet",
  project_manager: "You haven't uploaded any documents yet",
  department_user: "No documents available for your department's cycles yet",
}

const FILE_TYPE_COLORS: Record<string, string> = {
  ".pdf":  "bg-red-100   text-red-700   dark:bg-red-900/30   dark:text-red-400",
  ".docx": "bg-blue-100  text-blue-700  dark:bg-blue-900/30  dark:text-blue-400",
  ".doc":  "bg-blue-100  text-blue-700  dark:bg-blue-900/30  dark:text-blue-400",
  ".xlsx": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  ".xls":  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  ".pptx": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  ".ppt":  "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  ".csv":  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
}

const PURPOSE_BADGE_COLORS: Record<string, string> = {
  kickoff:    "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  reference:  "bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-400",
  submission: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  supporting: "bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-400",
  template:   "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
}

function FileTypeIcon({ fileType }: { fileType: string }) {
  const ext = (fileType ?? "").toLowerCase()
  const colorClass = FILE_TYPE_COLORS[ext] ?? "bg-muted text-muted-foreground"
  const label = ext.replace(".", "").toUpperCase().slice(0, 4) || "FILE"
  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${colorClass}`}
    >
      {label}
    </div>
  )
}

const PAGE_SIZE = 50

export function KnowledgeBasePage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [purposeFilter, setPurposeFilter] = useState<PurposeFilter>("all")
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  // GET /knowledge-base/documents — server-paginated and role-scoped server-side.
  // The purpose filter is sent as a query param; pagination uses `total` below.
  const { data, isLoading, isFetching } = useKBDocuments({
    document_purpose: purposeFilter === "all" ? undefined : purposeFilter,
    page,
    page_size: PAGE_SIZE,
  })

  const docs = useMemo(() => data?.documents ?? [], [data?.documents])
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Group the current page's documents by cycle. cycle_name is resolved
  // server-side, so groups reflect only what's on this page.
  const cycleGroups = useMemo(() => {
    const map = new Map<
      string,
      { cycleId: string; cycleName: string; docs: KBDocument[] }
    >()
    for (const doc of docs) {
      const key = doc.cycle_id ?? "__none__"
      if (!map.has(key)) {
        map.set(key, {
          cycleId: key,
          cycleName: doc.cycle_name ?? "Uncategorized",
          docs: [],
        })
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

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ["kb-documents"] })
  }

  const subtitle =
    total > 0
      ? `Every uploaded document grouped by the cycle it belongs to · ${total} ${total === 1 ? "document" : "documents"}`
      : "Browse and download reference documents for your reporting cycles"

  const emptyMessage = EMPTY_STATE_MESSAGES[user?.role ?? ""] ?? "No documents found"

  return (
    <div className="space-y-6">
      <PageHeader
        title="Document Bank"
        description={subtitle}
        action={
          <Button variant="outline" onClick={handleRefresh} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {/* Filters — purpose is the only server-supported filter. */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select
          value={purposeFilter}
          onValueChange={(v) => {
            setPurposeFilter(v as PurposeFilter)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PURPOSE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-lg border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b bg-muted/30">
                <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              </div>
              <div className="divide-y">
                {[1, 2].map((j) => (
                  <div key={j} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-28 animate-pulse rounded bg-muted" />
                    </div>
                    <div className="h-8 w-24 animate-pulse rounded bg-muted" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && docs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 rounded-full bg-muted p-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold text-foreground">{emptyMessage}</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-xs">
            Documents uploaded through cycles will appear here.
          </p>
        </div>
      )}

      {/* Grouped document list */}
      {!isLoading && cycleGroups.length > 0 && (
        <div className="space-y-4">
          {cycleGroups.map((group) => (
            <div key={group.cycleId} className="rounded-lg border bg-card overflow-hidden">
              {/* Cycle header */}
              <div className="flex items-center justify-between px-5 py-4 border-b bg-muted/30">
                <h3 className="font-semibold text-sm text-foreground">{group.cycleName}</h3>
                <span className="text-xs text-muted-foreground font-medium">
                  {group.docs.length}{" "}
                  {group.docs.length === 1 ? "document" : "documents"}
                </span>
              </div>

              {/* Document rows */}
              <div className="divide-y">
                {group.docs.map((doc) => (
                  <div
                    key={doc.document_id}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/20 transition-colors"
                  >
                    <FileTypeIcon fileType={doc.file_type} />

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(doc.file_size)} · Uploaded{" "}
                        {formatDate(doc.created_at)}
                        {doc.uploader_name ? ` · ${doc.uploader_name}` : ""}
                      </p>
                    </div>

                    {doc.document_purpose && (
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          PURPOSE_BADGE_COLORS[doc.document_purpose] ??
                          "bg-muted text-muted-foreground"
                        }`}
                      >
                        {doc.document_purpose}
                      </span>
                    )}

                    <Button
                      size="sm"
                      onClick={() => handleDownload(doc)}
                      disabled={downloadingId === doc.document_id}
                      className="h-8 gap-1.5 shrink-0"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {downloadingId === doc.document_id ? "…" : "Download"}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination — driven by the server `total`. */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({total} total documents)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isFetching}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isFetching}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
