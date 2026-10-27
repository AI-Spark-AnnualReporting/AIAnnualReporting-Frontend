"use client"

import { use, useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ArrowLeft,
  ChevronDown,
  FileDown,
  FileText,
  Languages,
  Loader2,
  Pencil,
  RefreshCw,
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
import { PageLoader } from "@/components/ui/spinner"
import { FinalReportView } from "@/components/report/FinalReportView"
import {
  ArabicEdition,
  TranslationRun,
  useCreateArabic,
  withArabicCover,
} from "@/components/report/ArabicTranslation"
import { CARD, RAIL_LABEL } from "@/components/communication/review/shared"
import { ClientReviewCard, ClientReviewCardSkeleton } from "@/components/report-review/ClientReviewCard"
import { formatApprovedDate } from "@/components/communication/review/ReportStatusCard"
import type { ReportShare } from "@/lib/api/reportReview"
import { useAuth } from "@/contexts/AuthContext"
import { useReportReview } from "@/hooks/useReportReview"
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
 * here. The Arabic edition is always a draft: it has no approval of its own,
 * but Spark can send it to the client for review (its own link and versions).
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
  const { user } = useAuth()
  const isSpark = user?.role === "spark_internal"
  // The client's review of the Arabic. Once it was sent to them even once,
  // Create again is refused by the server, so the button is off.
  const reviewQuery = useReportReview(cycleId, !!arabicQuery.data, true)
  const review = reviewQuery.data
  // Create again replaces the Arabic, hand edits included, so it asks first.
  const [confirmCreate, setConfirmCreate] = useState(false)

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

  // From the click until the translation has started, the tab shows the
  // "Creating your Arabic report" loader at its first step, rather than a page
  // spinner and then a flash of "No Arabic version yet". It is drawn in the
  // same place as the real loader, so React keeps it on screen and the real
  // progress simply continues it. If nothing is started (an Arabic version
  // already exists, or the English report is not approved), the ?create=1 flag
  // is dropped and the normal page shows.
  const startingFromLink = askedToCreate && !createArabic.running
  const doNothing = useCallback(() => {}, [])
  const startingLoader = startingFromLink ? (
    <TranslationRun jobId={null} onFinished={doNothing} onRetry={doNothing} onClose={doNothing} />
  ) : null

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

  if (arabicQuery.isLoading && !startingFromLink) return <PageLoader />

  const cycleName = pmData?.cycle?.cycle_name
  // Created only from an approved English report, so a missing one just
  // means "not created yet" (or the English report was reopened since).
  const canCreate = !!approval?.locked
  // Edit Arabic: off while the client has the link, or once they approved it.
  const reviewBlocksEdit = review ? !review.can_reassemble : false
  // Create again: off for good once the Arabic was sent to the client.
  const sentToClient = !!review?.share
  const approveFirst = "Approve the English report before creating the Arabic version."
  let editReason: string | undefined = undefined
  if (!canCreate) editReason = approveFirst
  else if (review?.awaiting_client) editReason = "The Arabic report is with the client. You can edit it once they answer."
  else if (reviewBlocksEdit) editReason = "The client approved this Arabic report, so it can't be changed."
  let createAgainReason: string | undefined = undefined
  if (!canCreate) createAgainReason = approveFirst
  else if (sentToClient) createAgainReason = "The Arabic was already sent to the client. Use Edit Arabic to make changes."

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

        {arabicReport && (
          <>
            {canCreate && !reviewBlocksEdit && !createArabic.running ? (
              <Link href={`/pm/cycles/${cycleId}/report/arabic/edit`} className="shrink-0">
                <Button variant="outline" size="sm" className="h-8">
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit Arabic
                </Button>
              </Link>
            ) : (
              <Button variant="outline" size="sm" className="h-8" disabled title={editReason}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit Arabic
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmCreate(true)}
              disabled={!canCreate || sentToClient || createArabic.running}
              title={createAgainReason}
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

      {createArabic.loader ?? startingLoader}

      <ConfirmDialog
        open={confirmCreate}
        onOpenChange={setConfirmCreate}
        title="Create the Arabic report again?"
        description="This translates the English again and replaces the Arabic report, including any changes made by hand."
        confirmLabel="Create again"
        variant="destructive"
        onConfirm={() => {
          setConfirmCreate(false)
          createArabic.create()
        }}
      />

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
            <ArabicStatusCard share={review?.share} />
            {/* Spark sends the Arabic to the client from here. Everyone else
                sees the card once it has been sent, read-only. */}
            {!review && reviewQuery.isLoading && <ClientReviewCardSkeleton />}
            {review && (isSpark || review.share) && (
              <ClientReviewCard
                cycleId={cycleId}
                state={review}
                isSpark={isSpark}
                locked={!!approval?.locked}
                arabic
              />
            )}
          </aside>
        )}
      </div>
    </div>
  )
}

/**
 * The Arabic edition's status, from its client review: Approved once the
 * client approved it, otherwise Draft (with what changes it: Create again
 * before it is sent, Edit Arabic after).
 */
function ArabicStatusCard({ share }: { share: ReportShare | null | undefined }) {
  if (share?.status === "approved") {
    const on = share.responded_at ? formatApprovedDate(share.responded_at) : null
    return (
      <div style={{ ...CARD, padding: "14px 16px" }}>
        <div style={RAIL_LABEL}>Report status</div>
        <div className="flex items-center gap-2">
          <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-green-600" />
          <span className="text-[13.5px] font-bold text-slate-900">Approved</span>
          <span className="text-xs text-slate-600">· {on ? `approved by client ${on}` : "approved by client"}</span>
        </div>
      </div>
    )
  }
  return (
    <div style={{ ...CARD, padding: "14px 16px" }}>
      <div style={RAIL_LABEL}>Report status</div>
      <div className="flex items-center gap-2">
        <span className="h-[9px] w-[9px] shrink-0 rounded-full bg-amber-600" />
        <span className="text-[13.5px] font-bold text-slate-900">Draft</span>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        {share
          ? "Changes are made with Edit Arabic."
          : "Made from the approved English report. Create again makes it again from the English."}
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
