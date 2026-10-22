"use client"

import { use, useCallback, useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ArrowLeft,
  ChevronDown,
  FileDown,
  FileText,
  Languages,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { RouteGuard } from "@/components/auth/RouteGuard"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PageLoader } from "@/components/ui/spinner"
import { FinalReportView } from "@/components/report/FinalReportView"
import {
  ArabicEdition,
  useCreateArabic,
  withArabicCover,
} from "@/components/report/ArabicTranslation"
import { CARD, RAIL_LABEL } from "@/components/communication/review/shared"
import {
  useArabicReport,
  useAssembledReport,
  useRenderReport,
  useReportApproval,
} from "@/hooks/useReportBuilder"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { formatDateTime } from "@/lib/utils"
import type { CompanyProfile, ContentLanguage, Sector } from "@/types"

/**
 * The cycle's Arabic edition on its own page, with its own Create again and
 * Export. The English report page only creates it the first time and links
 * here. The Arabic edition is always a draft: it has no approval of its own.
 */
export default function ArabicReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return (
    <RouteGuard allowedRoles={["project_manager", "admin"]}>
      <ArabicReportShell cycleId={id} />
    </RouteGuard>
  )
}

interface DashboardData {
  cycle?: {
    cycle_name?: string
    fiscal_year?: number
    company_profile?: CompanyProfile | null
    sector?: Sector | null
    content_language?: ContentLanguage
  }
}

function ArabicReportShell({ cycleId }: { cycleId: string }) {
  const arabicQuery = useArabicReport(cycleId)
  const arabicReport = arabicQuery.data
  // The English design: logo, colours and layout. The Arabic cover lines go on top.
  const assembledQuery = useAssembledReport(cycleId)
  const { data: pmDataRaw } = usePMCycleDashboard(cycleId)
  const pmData = pmDataRaw as DashboardData | undefined
  const approval = useReportApproval(cycleId).data
  const render = useRenderReport(cycleId, true)

  // Create again stays on this page; the new version is re-read by the hook.
  const stayHere = useCallback(() => {}, [])
  const createArabic = useCreateArabic(cycleId, stayHere)
  const englishPage = `/pm/cycles/${cycleId}/report`

  // Create Arabic on the English page opens this page in a new tab with
  // ?create=1, and the translation starts here. Started at most once, and the
  // flag is taken off the address so a refresh doesn't start a second one.
  const router = useRouter()
  const searchParams = useSearchParams()
  const askedToCreate = searchParams.get("create") === "1"
  const createStarted = useRef(false)
  const arabicLoaded = !arabicQuery.isLoading
  const approvalLoaded = approval !== undefined
  const startCreate = createArabic.create

  useEffect(() => {
    if (!askedToCreate || createStarted.current) return
    if (!arabicLoaded || !approvalLoaded) return
    createStarted.current = true
    router.replace(`/pm/cycles/${cycleId}/report/arabic`)
    // Only when there is no Arabic version yet and the English is approved;
    // otherwise the page just shows as usual.
    if (!arabicReport && approval?.locked) startCreate()
  }, [askedToCreate, arabicLoaded, approvalLoaded, arabicReport, approval, router, cycleId, startCreate])

  // Same full-width document as the English report page.
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

  if (arabicQuery.isLoading) return <PageLoader />

  const cycleName = pmData?.cycle?.cycle_name
  // Created only from an approved English report, so a missing one just
  // means "not created yet" (or the English report was reopened since).
  const canCreate = !!approval?.locked

  return (
    <div className="-m-8 flex h-[calc(100vh-72px)] flex-col overflow-hidden bg-background">
      <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b bg-card shrink-0">
        <Link href={englishPage} aria-label="Back to the English report">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-sm truncate flex items-center gap-2">
            Arabic Report{cycleName ? ` — ${cycleName}` : ""}
            <span
              lang="ar"
              className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700"
            >
              العربية
            </span>
          </h1>
          {arabicReport?.generated_at && (
            <p className="text-xs text-muted-foreground">
              Created {formatDateTime(arabicReport.generated_at)} · from the approved English report
              {typeof arabicReport.word_count === "number"
                ? ` · ${arabicReport.word_count.toLocaleString()} words`
                : ""}
            </p>
          )}
        </div>

        <Link href={englishPage} className="shrink-0">
          <Button variant="ghost" size="sm" className="h-8">
            English report
          </Button>
        </Link>

        {arabicReport && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={createArabic.create}
              disabled={!canCreate || createArabic.running}
              title={canCreate ? undefined : "Approve the English report before creating the Arabic version."}
              className="h-8"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Create again
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="brand" disabled={render.isPending} className="h-8">
                  {render.isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      {render.variables?.format === "pdf"
                        ? "Generating PDF…"
                        : "Generating Word document…"}
                    </>
                  ) : (
                    <>
                      <FileDown className="h-3.5 w-3.5 mr-1.5" />
                      Export Arabic
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
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {createArabic.loader}

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto">
          {arabicReport ? (
            <ArabicEdition>
              <FinalReportView
                report={arabicReport}
                cycle={{ ...pmData?.cycle, content_language: "arabic" }}
                assembled={withArabicCover(assembledQuery.data, arabicReport.cover_values)}
                assembledPending={assembledQuery.isPending}
                westernDigits
              />
            </ArabicEdition>
          ) : (
            <NoArabicYet
              canCreate={canCreate}
              creating={createArabic.running}
              onCreate={createArabic.create}
              englishPage={englishPage}
            />
          )}
        </div>

        {arabicReport && (
          <aside
            className="shrink-0 overflow-y-auto border-l px-4 py-5"
            style={{
              width: 290 + 32,
              background: "#F2F3FA",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <ArabicStatusCard />
          </aside>
        )}
      </div>
    </div>
  )
}

/** The Arabic edition's status: always Draft, it has no approval of its own. */
function ArabicStatusCard() {
  return (
    <div style={{ ...CARD, padding: "14px 16px" }}>
      <div style={RAIL_LABEL}>Report status</div>
      <div className="flex items-center gap-2">
        <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-amber-600" />
        <span className="text-[13.5px] font-bold text-slate-900">Draft</span>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        Made from the approved English report. If the English report changes,
        use Create again.
      </p>
    </div>
  )
}

interface NoArabicYetProps {
  canCreate: boolean
  creating: boolean
  onCreate: () => void
  englishPage: string
}

/** Opened by link before any Arabic version exists. */
function NoArabicYet({ canCreate, creating, onCreate, englishPage }: NoArabicYetProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-8 min-h-[60vh]">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Languages className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-lg font-semibold mb-1.5">No Arabic version yet</h2>
        <p className="text-sm text-muted-foreground mb-5">
          {canCreate
            ? "Create the Arabic report from the approved English report."
            : "Approve the English report first, then create the Arabic version."}
        </p>
        <div className="flex items-center justify-center gap-2">
          <Button onClick={onCreate} disabled={!canCreate || creating} size="lg">
            <Languages className="h-4 w-4 mr-2" />
            Create Arabic
          </Button>
          <Link href={englishPage}>
            <Button variant="outline" size="lg">
              English report
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
