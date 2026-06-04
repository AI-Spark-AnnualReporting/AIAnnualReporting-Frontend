"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  ChevronDown,
  Download,
  FileCheck,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react"
import { RouteGuard } from "@/components/auth/RouteGuard"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PageSkeleton } from "@/components/ui/skeletons"
import { FinalReportView } from "@/components/report/FinalReportView"
import {
  useAssembleReport,
  useFinalReport,
  useRenderReport,
} from "@/hooks/useReportBuilder"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { formatDateTime } from "@/lib/utils"
import type { CompanyProfile, Sector } from "@/types"

export default function FinalReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return (
    <RouteGuard allowedRoles={["project_manager", "admin"]}>
      <FinalReportShell cycleId={id} />
    </RouteGuard>
  )
}

interface DashboardData {
  cycle?: {
    cycle_name?: string
    fiscal_year?: number
    company_profile?: CompanyProfile | null
    sector?: Sector | null
  }
}

function FinalReportShell({ cycleId }: { cycleId: string }) {
  const reportQuery = useFinalReport(cycleId)
  const { data: pmDataRaw } = usePMCycleDashboard(cycleId)
  const pmData = pmDataRaw as DashboardData | undefined
  const assemble = useAssembleReport(cycleId)
  const render = useRenderReport(cycleId)

  const [reassembleOpen, setReassembleOpen] = useState(false)

  // Match the builder shell's chrome-collapse for full document width.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("sidebar-set-mode", { detail: { mode: "hidden" } }),
    )
    return () => {
      window.dispatchEvent(
        new CustomEvent("sidebar-set-mode", { detail: { mode: "expanded" } }),
      )
    }
  }, [])

  if (reportQuery.isLoading) return <PageSkeleton />

  const report = reportQuery.data
  // 404 / missing report → empty state with an Assemble CTA.
  const reportMissing = !!reportQuery.error || !report

  return (
    <div className="-mx-6 -mt-6 -mb-6 flex flex-col min-h-[calc(100vh-4rem)] bg-background print:block print:m-0 print:min-h-0">
      <div className="flex items-center gap-3 px-5 py-3 border-b bg-card shrink-0 print:hidden">
        <Link href={`/pm/cycles/${cycleId}/build`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-sm truncate">
            Final Report
            {pmData?.cycle?.cycle_name ? ` — ${pmData.cycle.cycle_name}` : ""}
          </h1>
          {report?.generated_at && (
            <p className="text-xs text-muted-foreground">
              Generated {formatDateTime(report.generated_at)}
              {typeof report.word_count === "number"
                ? ` · ${report.word_count.toLocaleString()} words`
                : ""}
            </p>
          )}
        </div>

        {!reportMissing && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReassembleOpen(true)}
              disabled={assemble.isPending || render.isPending}
              className="h-8"
            >
              {assemble.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Re-assemble
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" disabled={render.isPending} className="h-8">
                  {render.isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      {render.variables?.format === "pdf"
                        ? "Generating PDF…"
                        : render.variables?.format === "docx"
                          ? "Generating Word document…"
                          : "Generating document…"}
                    </>
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Download
                      <ChevronDown className="h-3.5 w-3.5 ml-1.5 opacity-70" />
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                <DropdownMenuItem
                  onClick={() => render.mutate({ format: "docx" })}
                  disabled={render.isPending}
                  className="flex items-center gap-2"
                >
                  <FileText className="h-4 w-4" />
                  <span className="flex-1">Word (.docx)</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => render.mutate({ format: "pdf" })}
                  disabled={render.isPending}
                  className="flex items-center gap-2"
                >
                  <FileText className="h-4 w-4" />
                  <span className="flex-1">PDF</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Financials merged
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto print:overflow-visible">
        {reportMissing ? (
          <EmptyReport cycleId={cycleId} />
        ) : (
          <FinalReportView report={report} cycle={pmData?.cycle} />
        )}
      </div>

      <ConfirmDialog
        open={reassembleOpen}
        onOpenChange={setReassembleOpen}
        title="Re-assemble the report?"
        description="Regenerate the executive summary and reassemble the document from the latest locked sections."
        confirmLabel="Re-assemble"
        variant="destructive"
        isLoading={assemble.isPending}
        onConfirm={async () => {
          await assemble.mutateAsync({ refresh: true })
          setReassembleOpen(false)
        }}
      />
    </div>
  )
}

function EmptyReport({ cycleId }: { cycleId: string }) {
  const assemble = useAssembleReport(cycleId)
  return (
    <div className="flex flex-1 items-center justify-center p-8 min-h-[60vh]">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <FileCheck className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-lg font-semibold mb-1.5">
          No assembled report yet
        </h2>
        <p className="text-sm text-muted-foreground mb-5">
          Once all sections are locked, assemble the report to produce the
          final document.
        </p>
        <div className="flex items-center justify-center gap-2">
          <Button
            onClick={() => assemble.mutate({})}
            disabled={assemble.isPending}
            size="lg"
          >
            {assemble.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Assembling…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Assemble Report
              </>
            )}
          </Button>
          <Link href={`/pm/cycles/${cycleId}/build`}>
            <Button variant="outline" size="lg">
              Back to Builder
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
