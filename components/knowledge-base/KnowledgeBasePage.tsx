"use client"

import { useState, useMemo } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useKBDocuments, useKBCycleNames } from "@/hooks/useKnowledgeBase"
import { knowledgeBaseApi } from "@/lib/api/knowledge-base"
import { KBDocument } from "@/types"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Download, Search, RefreshCw, FileText } from "lucide-react"
import { formatDate, formatFileSize } from "@/lib/utils"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"

const PURPOSE_OPTIONS = [
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
  const [purposeFilter, setPurposeFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  // GET /documents/ returns every document the user owns in one unpaginated
  // payload — purpose-filtering, search and pagination are all done below.
  const { data, isLoading } = useKBDocuments()
  // cycle_id -> cycle_name, resolved from the role-appropriate cycles endpoint.
  const { data: cycleNames } = useKBCycleNames()

  const allDocs = useMemo(() => data?.documents ?? [], [data?.documents])

  // Purpose filter — /documents/ has no purpose query param.
  const purposeFiltered = useMemo(() => {
    if (purposeFilter === "all") return allDocs
    return allDocs.filter((doc) => doc.document_purpose === purposeFilter)
  }, [allDocs, purposeFilter])

  // Search filter — matches filename, cycle name, uploader and department.
  const filteredDocs = useMemo(() => {
    if (!search) return purposeFiltered
    const q = search.toLowerCase()
    return purposeFiltered.filter((doc) => {
      const cycleName = (doc.cycle_id && cycleNames?.[doc.cycle_id]) || ""
      return (
        doc.filename.toLowerCase().includes(q) ||
        cycleName.toLowerCase().includes(q) ||
        (doc.uploader_name?.toLowerCase().includes(q) ?? false) ||
        (doc.department_name?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [purposeFiltered, search, cycleNames])

  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / PAGE_SIZE))

  // Client-side pagination — /documents/ is not paginated server-side.
  const pagedDocs = useMemo(
    () => filteredDocs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredDocs, page]
  )

  const cycleGroups = useMemo(() => {
    const map = new Map<
      string,
      { cycleId: string; cycleName: string; docs: KBDocument[] }
    >()
    for (const doc of pagedDocs) {
      const key = doc.cycle_id ?? "__none__"
      if (!map.has(key)) {
        const name = (doc.cycle_id && cycleNames?.[doc.cycle_id]) || "Uncategorized"
        map.set(key, { cycleId: key, cycleName: name, docs: [] })
      }
      map.get(key)!.docs.push(doc)
    }
    return Array.from(map.values())
  }, [pagedDocs, cycleNames])

  // Distinct cycles across the full filtered set (not just the current page).
  const totalCycleCount = useMemo(
    () => new Set(filteredDocs.map((doc) => doc.cycle_id ?? "__none__")).size,
    [filteredDocs]
  )
  const totalDocCount = filteredDocs.length

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
    totalDocCount > 0
      ? `Every uploaded document grouped by the cycle it belongs to · ${totalCycleCount} ${totalCycleCount === 1 ? "cycle" : "cycles"} · ${totalDocCount} ${totalDocCount === 1 ? "document" : "documents"}`
      : "Browse and download reference documents for your reporting cycles"

  const emptyMessage = EMPTY_STATE_MESSAGES[user?.role ?? ""] ?? "No documents found"

  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge Base"
        description={subtitle}
        action={
          <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <Select
          value={purposeFilter}
          onValueChange={(v) => {
            setPurposeFilter(v)
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
      {!isLoading && filteredDocs.length === 0 && (
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({totalDocCount} total documents)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

    </div>
  )
}
