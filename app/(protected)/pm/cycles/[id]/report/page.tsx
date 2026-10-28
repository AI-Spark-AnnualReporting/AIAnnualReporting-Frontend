"use client"

import { use, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  FileDown,
  FileCheck,
  FileText,
  Languages,
  Loader2,
  Lock,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Palette,
  Globe,
} from "lucide-react"
import { RouteGuard } from "@/components/auth/RouteGuard"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PageLoader } from "@/components/ui/spinner"
// Hidden 2026-09-24 with the Design button — see the comment beside it below.
// import { DesignDialog } from "@/components/report/design/DesignDialog"
import { FinalReportView } from "@/components/report/FinalReportView"
import { ReportHubPanel } from "@/components/communication/review/ReportHubPanel"
import { ReportStatusCard, ReportStatusCardSkeleton } from "@/components/communication/review/ReportStatusCard"
import { ReportValidateLoader } from "@/components/report/ReportValidateLoader"
import { ClientReviewCard, ClientReviewCardSkeleton } from "@/components/report-review/ClientReviewCard"
import { useReportReview } from "@/hooks/useReportReview"
import {
  useArabicReport,
  useAssembleReport,
  useAssemblyReadiness,
  useAssembledReport,
  useFinalReport,
  useRenderReport,
  useReportApproval,
  useValidateReport,
} from "@/hooks/useReportBuilder"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { QUERY_KEYS } from "@/lib/constants"
import { formatDateTime } from "@/lib/utils"
import type { CompanyProfile, ContentLanguage, Sector } from "@/types"

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
    content_language?: ContentLanguage
  }
}

function FinalReportShell({ cycleId }: { cycleId: string }) {
  const router = useRouter()
  const reportQuery = useFinalReport(cycleId)
  const validate = useValidateReport(cycleId)
  // The document as the engine will print it. Only once there is something to
  // assemble — asking before that is a guaranteed 422.
  const assembledQuery = useAssembledReport(cycleId, reportQuery.isSuccess)
  const assembled = assembledQuery.data
  const { data: pmDataRaw } = usePMCycleDashboard(cycleId)
  const pmData = pmDataRaw as DashboardData | undefined
  const assemble = useAssembleReport(cycleId)
  const render = useRenderReport(cycleId)

  // Sign-off state. `refetch` is stable, so it's safe to hand to the hub panel
  // as its onChanged — an inline arrow there would re-run its loader forever.
  const approvalQuery = useReportApproval(cycleId)
  const approval = approvalQuery.data
  // Spark doesn't send reports out for review, so the rail drops the whole
  // "Review & approval" card for them — without the share button it only
  // said "Not yet shared for review."
  const { user } = useAuth()
  const isSpark = user?.role === "spark_internal"

  // The client review (Spark sends the report to the client). Once the
  // report has been sent, the server refuses Re-assemble, Validate and every
  // Builder edit (changes go through Edit report), so those buttons are off
  // here too. Edit report only opens once the client asked for changes.
  const reviewQuery = useReportReview(cycleId, reportQuery.isSuccess)
  const review = reviewQuery.data
  const withClient = !!review?.awaiting_client
  const sentToClient = !!review?.share
  const changesRequested = review?.share?.status === "changes_requested"

  // The Client review card checks for the client's answer every minute; the
  // rest of the page does not. When the answer arrives (approved locks the
  // report; changes requested opens Edit report), re-read what depends on it,
  // so the Report status card and the buttons change with the card.
  const qc = useQueryClient()
  const shareStatus = review?.share?.status
  const lastShareStatus = useRef(shareStatus)
  useEffect(() => {
    const before = lastShareStatus.current
    lastShareStatus.current = shareStatus
    if (before === undefined || before === shareStatus) return
    qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_REPORT_APPROVAL(cycleId) })
    qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_FINAL_REPORT(cycleId) })
    qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_ASSEMBLED_REPORT(cycleId) })
  }, [shareStatus, qc, cycleId])
  // Re-assemble only when a section changed in the Builder since this report
  // was built (the Builder's "Assemble again" flag). With nothing new it only
  // rewrites the Executive Summary and throws away a clean validation.
  const builderChanged = !!useAssemblyReadiness(cycleId).data?.stale

  const [reassembleOpen, setReassembleOpen] = useState(false)
  // Hidden 2026-09-24 with the Design button — see the comment beside it below.
  // const [designOpen, setDesignOpen] = useState(false)

  // The Arabic edition lives on its own page (/report/arabic), always opened in
  // a new tab so the English report stays open here. English cycles only.
  const isEnglishCycle = pmData?.cycle?.content_language === "english"
  const arabicQuery = useArabicReport(cycleId, reportQuery.isSuccess && isEnglishCycle)
  const arabicReport = arabicQuery.data
  const arabicPage = `/pm/cycles/${cycleId}/report/arabic`

  /** Opens the Arabic page in a new tab, which starts the translation itself.
   *  The tab must open on the click: browsers block tabs opened later. */
  const createArabicInNewTab = () => {
    window.open(`${arabicPage}?create=1`, "_blank", "noopener")
  }

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

  if (reportQuery.isLoading) return <PageLoader />

  const report = reportQuery.data
  // 404 / missing report → empty state with an Assemble CTA.
  const reportMissing = !!reportQuery.error || !report
  // A stale one never reaches here - the server drops any validation that
  // predates the current assembly - so this means "there is a result that
  // describes this document".
  const hasValidation = !!report?.validation

  const locked = !!approval?.locked

  // Full-bleed and exactly one viewport tall, so the document and the rail each
  // own their scrollbar and the shell around them never gets one of its own.
  //
  // The numbers are AppShell's, not guesses: <main> pads its child px-8 py-8, so
  // -m-8 cancels it entirely, and PMTopNav is a fixed 72px — that is all the
  // height above us. Anything less exact leaves the page a few pixels too tall
  // and <main> grows a second, pointless scrollbar beside the report's own.
  return (
    <div className="-m-8 flex h-[calc(100vh-72px)] flex-col overflow-hidden bg-background print:m-0 print:block print:h-auto print:overflow-visible">
      <div className="flex items-center gap-3 px-5 py-3 border-b bg-card shrink-0 print:hidden">
        {/* A back arrow goes BACK. As a Link it pushed a new entry, so
            builder → report → arrow → builder left the report sitting in
            history, and the builder's own back arrow returned to it. Falls
            back to the builder for a direct link or a reload, where there is
            no in-app history to return to. */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Go back"
          onClick={() => {
            if (window.history.length > 1) router.back()
            else router.push(`/pm/cycles/${cycleId}/build`)
          }}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
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
              {review?.label ? ` · ${review.label}` : ""}
              {locked && approval?.approved_by
                ? ` · Approved by ${approval.approved_by}`
                : ""}
            </p>
          )}
        </div>

        {!reportMissing && (
          <>
            {/* Re-assembling or restyling a signed-off report is refused by the
                API (409), so both buttons go away rather than failing on click. */}
            {!locked && (
              <>
                {builderChanged && !sentToClient && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setReassembleOpen(true)}
                    disabled={assemble.isPending || render.isPending}
                    title="A section changed in the Builder after this report was built."
                    className="h-8"
                  >
                    {assemble.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Re-assemble
                  </Button>
                )}
                {/* Hidden 2026-09-24 — superseded by Create Design, which took
                    this button's Palette icon. The cover/typography/palette modal
                    itself is untouched in components/report/design/DesignDialog.tsx;
                    to bring it back, uncomment this block, the `designOpen` state
                    above, the <DesignDialog> mount below, and its import.
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDesignOpen(true)}
                  className="h-8"
                >
                  <Palette className="h-3.5 w-3.5 mr-1.5" />
                  Design
                </Button>
                */}
                {/* The page designer. Structuring every section happens on
                    that screen, not here, so a refresh mid-run still resumes. */}
                <Link href={`/pm/cycles/${cycleId}/create-design`} className="shrink-0">
                  <Button variant="ghost" size="sm" className="h-8">
                    <Palette className="h-3.5 w-3.5 mr-1.5" />
                    Create Design
                  </Button>
                </Link>
              </>
            )}
            {/* The microsite's sitemap. Outside the lock gate on purpose: a
                website is usually made after sign-off, and the sitemap changes
                nothing in the printed report. */}
            <Link href={`/pm/cycles/${cycleId}/web`} className="shrink-0">
              <Button variant="ghost" size="sm" className="h-8">
                <Globe className="h-3.5 w-3.5 mr-1.5" />
                Web
              </Button>
            </Link>
                        {/* Outside the locked group above. Re-assembling a signed-off
                report is refused by the API, so those buttons rightly go away -
                but reading what the validation found is not a change to
                anything, and an approved report is when someone most wants to
                know whether it was checked. A locked report therefore keeps the
                button in its read-only form and can never re-run the check. */}
                {/* The run happens on the click rather than on the
                    validation page's mount. Fired from a mount effect the
                    mutation completed - the request returned 200 and onSuccess
                    ran - but the component never re-rendered and the loader sat
                    there until a three-minute failsafe cleared it. From a click
                    it behaves. So: click here, navigate when it is done, and
                    the page that receives them only ever reads a stored
                    result. */}
                {/* Once sent, the report is never validated again: the
                    button only opens a result already on file. */}
                {(hasValidation || (!locked && !sentToClient)) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // A signed-off report is never re-validated - the API
                    // refuses to change it, and a fresh verdict on a document
                    // nobody can edit is a cost with no action behind it.
                    if (locked || sentToClient) {
                      router.push(`/pm/cycles/${cycleId}/validation`)
                      return
                    }
                    // Already validated: open it. Re-running costs ~16 model
                    // calls and half a minute to reproduce a result that is
                    // already on file, and the server has already discarded
                    // this one if the report was re-assembled since - so a
                    // validation that survives to here describes the document
                    // currently on screen. "Validate again" lives on the page
                    // it opens, for when the PM does want a fresh run.
                    if (hasValidation) {
                      router.push(`/pm/cycles/${cycleId}/validation`)
                      return
                    }
                    validate.mutate(undefined, {
                      // Only on success. A failed run must leave the PM on the
                      // report with the error toast, not on a validation page
                      // showing a result that is not the one they just asked
                      // for.
                      onSuccess: () =>
                        router.push(`/pm/cycles/${cycleId}/validation`),
                    })
                  }}
                  disabled={validate.isPending}
                  className="h-8"
                >
                  {validate.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {validate.isPending
                    ? "Validating\u2026"
                    : hasValidation
                      ? "View validation"
                      : "Validate report"}
                </Button>
                )}
            {/* The client asked for changes: the PM edits the report here,
                not in the Builder. Saving makes the next version. */}
            {changesRequested && !locked && (
              <Link href={`/pm/cycles/${cycleId}/report/edit`} className="shrink-0">
                <Button variant="brand" size="sm" className="h-8">
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit report
                </Button>
              </Link>
            )}
            {/* Create Arabic the first time; afterwards it opens the Arabic
                page, which has its own Create again and Export. Both open a
                new tab. */}
            {isEnglishCycle && arabicReport && (
              <Link
                href={arabicPage}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
              >
                <Button variant="outline" size="sm" className="h-8">
                  <Languages className="h-3.5 w-3.5 mr-1.5" />
                  Open Arabic
                  <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              </Link>
            )}
            {isEnglishCycle && !arabicReport && (
              <Button
                variant="outline"
                size="sm"
                onClick={createArabicInNewTab}
                // Only a signed-off report is translated; the server refuses too.
                // Greyed only before the first answer: a re-check (e.g. on
                // returning to the tab) puts a "not found" back to loading,
                // which made the button blink. errorUpdateCount survives that.
                disabled={!locked || (arabicQuery.isLoading && arabicQuery.errorUpdateCount === 0)}
                title={locked ? undefined : "The client approves the report first, then the Arabic version can be created."}
                className="h-8"
              >
                <Languages className="h-3.5 w-3.5 mr-1.5" />
                Create Arabic
              </Button>
            )}
            {/* Export is the last step, not a parallel one. Quarterly
                (AssembledReportPage) and earnings (PublishBar) both hide it
                until the report is signed off, so a draft cannot be handed
                round as though it were the final file. The client's approval
                is what signs it off. */}
            {locked && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="brand"
                    disabled={render.isPending}
                    className="h-8"
                  >
                    {render.isPending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        {render.variables?.format === "pdf"
                          ? "Generating PDF…"
                          : render.variables?.format === "docx"
                            ? "Generating Word document…"
                            : render.variables?.format === "idml"
                              ? "Generating InDesign file…"
                              : "Generating document…"}
                      </>
                    ) : (
                      <>
                        <FileDown className="h-3.5 w-3.5 mr-1.5" />
                        Export
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
                  <DropdownMenuItem
                    onClick={() => render.mutate({ format: "idml" })}
                    disabled={render.isPending}
                    className="flex items-center gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    <span className="flex-1">InDesign (.idml)</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      For designers
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        )}
      </div>

      {/* The toast is gone in five seconds; the report is still unchecked.
          This stays until a validation that describes THIS assembly exists,
          which is the same moment `validation_stale` goes false. Hidden once
          locked - a signed-off report cannot be re-validated, so nagging about
          it asks for something that is no longer possible. */}
      {report?.validation_stale && !locked && !sentToClient && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-900 print:hidden">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            This report was re-assembled after it was validated. The earlier
            result describes the previous version, so it is no longer shown or
            printed &mdash; validate it again.
          </span>
        </div>
      )}

      {withClient && review?.share && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-900 print:hidden">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          <span>
            The report is with {review.share.client_email} for review. It
            can&apos;t be edited until they answer.
          </span>
        </div>
      )}

      {validate.isPending && <ReportValidateLoader stage={validate.stage} />}

      <div className="flex flex-1 min-h-0 print:block">
        <div className="flex-1 overflow-y-auto print:overflow-visible">
          {reportMissing ? (
            <EmptyReport cycleId={cycleId} />
          ) : (
            <FinalReportView report={report} cycle={pmData?.cycle}
                             assembled={assembled}
                             assembledPending={assembledQuery.isPending} />
          )}

        </div>

        {/* The rail. For PM / admin: the Communication Hub, same composition as the board report's:
            a plain status card, then "Share for review" (assigns a reviewer and
            starts the thread), Discuss, and the reviewer's approve / send-back
            screen. Status lives in the card above, so the panel's own radios
            stay hidden. Only exists once the report has been assembled, since
            that is what creates the shared reports row. */}
        {/* While the sign-off state loads, the rail shows its cards' shapes. */}
        {!reportMissing && !approval && approvalQuery.isLoading && (
          <aside
            className="shrink-0 border-l px-4 py-5 print:hidden"
            style={{ width: 290 + 32, background: "#F2F3FA", display: "flex", flexDirection: "column", gap: 14 }}
          >
            <ReportStatusCardSkeleton />
            <ClientReviewCardSkeleton />
          </aside>
        )}
        {approval?.report_id && (
          <aside
            className="shrink-0 overflow-y-auto border-l px-4 py-5 print:hidden"
            style={{
              // 290px rail + padding, and the same ground the cards are drawn
              // for — white-on-white would flatten them into the document.
              width: 290 + 32,
              background: "#F2F3FA",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <ReportStatusCard status={approval.status} approvedAt={approval.approved_at} />
            {!isSpark && (
              <ReportHubPanel
                reportId={approval.report_id}
                showStatus={false}
                readOnly={locked || withClient}
                onChanged={approvalQuery.refetch}
              />
            )}
            {/* Spark sends the report to the client from here. Everyone else
                sees the card once it has been sent, read-only. */}
            {!review && reviewQuery.isLoading && <ClientReviewCardSkeleton />}
            {review && (isSpark || review.share) && (
              <ClientReviewCard
                cycleId={cycleId}
                state={review}
                isSpark={isSpark}
                locked={locked}
              />
            )}
          </aside>
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

      {/* Hidden 2026-09-24 with the Design button that opened it.
      <DesignDialog
        cycleId={cycleId}
        open={designOpen}
        onOpenChange={setDesignOpen}
        // From the assembled document, so the modal previews the real cover —
        // the company's own mark, its title, and any uploaded cover image. It
        // used to be given three fields, which is why the preview showed a
        // logo-less page that looked nothing like the file.
        cover={{
          companyName: assembled?.cover?.values?.company_name,
          title: assembled?.cover?.values?.title ?? pmData?.cycle?.cycle_name,
          headline: assembled?.cover?.values?.headline ?? report?.headline ?? undefined,
          periodLabel:
            assembled?.cover?.values?.period_label ??
            (pmData?.cycle?.fiscal_year ? `FY ${pmData.cycle.fiscal_year}` : undefined),
          preparedOn: assembled?.cover?.values?.prepared_on,
          footnote: assembled?.cover?.values?.footnote,
          logoUrl: assembled?.cover?.values?.logo_url ?? undefined,
          coverImage: assembled?.cover?.values?.cover_image ?? undefined,
          isArabic: assembled?.content_language === "arabic",
        }}
        onSaved={() =>
          qc.invalidateQueries({
            queryKey: QUERY_KEYS.PM_ASSEMBLED_REPORT(cycleId),
          })
        }
      />
      */}

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
