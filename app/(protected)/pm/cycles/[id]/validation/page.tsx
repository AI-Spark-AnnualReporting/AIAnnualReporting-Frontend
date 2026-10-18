"use client"

import { use, useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { ArrowLeft, Check, Lock, RefreshCw, ShieldCheck } from "lucide-react"

import { RouteGuard } from "@/components/auth/RouteGuard"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { PageLoader } from "@/components/ui/spinner"
import { ReportValidateLoader } from "@/components/report/ReportValidateLoader"
import { ValidationPanel } from "@/components/report/ValidationPanel"
import {
  readError,
  useFinalReport,
  usePMCycleSections,
  useReportApproval,
  useValidateReport,
  type MutationError,
} from "@/hooks/useReportBuilder"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { pmApi } from "@/lib/api/pm"
import { QUERY_KEYS } from "@/lib/constants"
import { formatDateTime } from "@/lib/utils"
import type { FinalReport } from "@/types"

// Same pace and patience as the builder's Assemble button (AssembleEntry).
const POLL_INTERVAL_MS = 3_000
const POLL_GIVE_UP_MS = 8 * 60_000

/**
 * Wait for a re-assembly started in the background to save its report.
 *
 * @param previousGeneratedAt The report's `generated_at` before the run started.
 * @returns The newly saved report.
 * @throws When no new report appears in time.
 */
async function waitForNewAssembly(
  cycleId: string,
  previousGeneratedAt: string | null,
): Promise<FinalReport> {
  const giveUpAt = Date.now() + POLL_GIVE_UP_MS
  while (Date.now() < giveUpAt) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    try {
      const report = await pmApi.getFinalReport(cycleId)
      if (report.generated_at && report.generated_at !== previousGeneratedAt) return report
    } catch {
      // not saved yet
    }
  }
  throw new Error("Re-assembling didn't finish. Please try again.")
}

/* The validation findings, on their own page.
 *
 * Its own tab rather than a panel above the document: the findings are worked
 * through against the report, and stacking them on top of it meant scrolling
 * past one to read the other. A URL also means it can sit on a second screen,
 * or be sent to someone.
 *
 * `?run=1` is what the Validate button opens, and it runs on arrival. Reaching
 * the page any other way shows the stored result instead — returning to a
 * bookmark should not spend another thirty seconds of model time. */
export default function ValidationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <RouteGuard allowedRoles={["project_manager", "admin"]}>
      <ValidationView cycleId={id} />
    </RouteGuard>
  )
}

function ValidationView({ cycleId }: { cycleId: string }) {
  const reportQuery = useFinalReport(cycleId)
  const validate = useValidateReport(cycleId)
  const { data: dash } = usePMCycleDashboard(cycleId)
  const { data: approval } = useReportApproval(cycleId)
  // A signed-off report cannot be edited, so a fresh verdict on it is a cost
  // with nothing to act on - and the stored one is what the printed Validation
  // Report page states. Overwriting it would leave the file and the screen
  // disagreeing about a document nobody can change.
  const locked = !!approval?.locked
  // Sections with an AI refine box. Extract and manual sections have none, so
  // their fixes open by hand. Undefined until loaded, which offers the AI fix.
  const sectionsQuery = usePMCycleSections(cycleId)
  const aiSections = sectionsQuery.data
    ? new Set(
        sectionsQuery.data
          .filter((s) => s.mode === "generate" || s.mode === "analyze")
          .map((s) => s.section_code),
      )
    : undefined

  // Fire once. The ref, not isPending: pending is still false on the render
  // that schedules the call, and React runs effects twice in dev — without it
  // this bills two runs every time the tab opens.
  //
  // `?run=1` is read from the URL directly rather than with useSearchParams.
  // That hook needs a Suspense boundary in the App Router, and without one the
  // component stopped re-rendering once the mutation settled: the run finished,
  // onSuccess fired, and the loader stayed on screen forever.
  //
  // `running` is local state rather than validate.isPending. Fired from an
  // effect on mount, the mutation completed — the request returned 200 and
  // onSuccess ran — but isPending never flipped back and the loader stayed up
  // forever. The same mutation fired from a click behaves correctly, so this is
  // something about the observer's lifecycle on mount that I could not pin
  // down. A flag this component owns is not subject to it.
  //
  // Seeded from the URL rather than flipped on in the effect. An effect runs
  // after the first paint, so the PM saw the page — header, stored findings or
  // the empty state — flash up before the loader replaced it. The tab is opened
  // to run, so it should be loading from the first frame.
  const [running, setRunning] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("run") === "1",
  )
  const started = useRef(false)
  // Findings still showing Fix / Ignore, as the panel counts them. Validating
  // again is locked until every one is Fixed or Ignored, so the PM works
  // through the whole list before spending another run.
  const [openFindings, setOpenFindings] = useState(0)
  const [fixedFindings, setFixedFindings] = useState(0)
  // Stable, so the panel's effect doesn't re-run on every render.
  const onProgress = useCallback((open: number, fixed: number) => {
    setOpenFindings(open)
    setFixedFindings(fixed)
  }, [])

  const run = () => {
    setRunning(true)
    validate.mutate(undefined, { onSettled: () => setRunning(false) })
  }

  // After fixes: rebuild the report from the edited sections (which also
  // rewrites the Executive Summary), then check it again. Two existing steps
  // in one click - refresh: true is what makes assembling a rebuild.
  const qc = useQueryClient()
  const [reassembling, setReassembling] = useState(false)
  const reassembleAndValidate = async () => {
    setReassembling(true)
    const previousGeneratedAt = reportQuery.data?.generated_at ?? null
    try {
      await pmApi.startAssemble(cycleId, true)
      const report = await waitForNewAssembly(cycleId, previousGeneratedAt)
      qc.setQueryData<FinalReport>(QUERY_KEYS.PM_FINAL_REPORT(cycleId), report)
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_ASSEMBLY_READINESS(cycleId) })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_ASSEMBLED_REPORT(cycleId) })
    } catch (err) {
      toast.error(readError(err as MutationError, "Couldn't re-assemble the report."))
      setReassembling(false)
      return
    }
    setReassembling(false)
    run()
  }

  // No give-up timer any more. The run is polled (validateReport starts a job
  // and re-reads it every few seconds), so the loader ends when the job does:
  // completed, failed, or reported failed by the server after 20 minutes. A
  // fixed three-minute cut-off would now stop a long report that is still
  // being checked.

  useEffect(() => {
    if (started.current) return
    if (new URLSearchParams(window.location.search).get("run") !== "1") return
    started.current = true
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cycleName =
    (dash as { cycle?: { cycle_name?: string } } | undefined)?.cycle?.cycle_name

  // Prefer the run just finished; fall back to what the server stored. The
  // server has already discarded a validation that predates this assembly.
  // The run's own result only until the reloaded report catches up with it.
  // After that the report's copy is shown: it is the one Ignore edits, so an
  // Ignore made on the run's copy changed nothing on screen.
  const fromRun = validate.data?.validation ?? null
  const fromReport = reportQuery.data?.validation ?? null
  const reportIsBehind =
    !!fromRun &&
    (!fromReport || Date.parse(fromReport.validated_at) < Date.parse(fromRun.validated_at))
  const validation = reportIsBehind ? fromRun : fromReport

  if (reassembling) return <ReportValidateLoader stage="Re-assembling the report with your edits" />
  if (running) return <ReportValidateLoader stage={validate.stage} />
  if (reportQuery.isLoading) return <PageLoader />

  const editedCount = validation?.edited_since_check?.length ?? 0
  const mustFixFirst = !!validation && !locked && openFindings > 0
  const fixFirstText = `Fix or ignore the ${openFindings} open finding${
    openFindings === 1 ? "" : "s"
  } before validating again.`
  // Findings ignored since this check. Some scores (house style) are worked
  // out during validation, so the PM is told to validate again.
  const ignoredCount = validation
    ? Object.values(validation.ignored ?? {}).filter(
        (entry) => Date.parse(entry.at) > Date.parse(validation.validated_at),
      ).length
    : 0
  // The progress box replaces the top-right button while findings are open
  // (even "0 of N done" right after a check), or once the PM has fixed,
  // ignored or edited something (an edit needs a rebuild).
  const doneCount = fixedFindings + ignoredCount
  const totalCount = doneCount + openFindings
  const showProgress =
    !!validation &&
    !locked &&
    (openFindings > 0 || doneCount > 0 || editedCount > 0 || ignoredCount > 0)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <div className="flex items-start gap-3">
        <Link href={`/pm/cycles/${cycleId}/report`}>
          <Button variant="outline" size="icon" className="mt-0.5 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          className="flex-1"
          title="Report Validation"
          description={
            validation
              ? `${cycleName ?? "This report"} — checked ${formatDateTime(validation.validated_at)}${
                  locked ? " · approved, so this is the final check" : ""
                }`
              : `${cycleName ?? "This report"} — not checked yet`
          }
          action={
            showProgress ? null : (
            <Button
              variant="outline"
              onClick={run}
              disabled={running || locked || mustFixFirst}
              title={
                locked
                  ? "This report is approved. Its validation is kept as the record behind the Validation Report page."
                  : mustFixFirst
                    ? fixFirstText
                    : undefined
              }
            >
              {mustFixFirst ? (
                <Lock className="mr-2 h-4 w-4" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              {validation ? "Validate again" : "Validate report"}
            </Button>
            )
          }
        />
      </div>

      {/* One box, one button, once the PM has started working through the
          findings. The button stays locked until every finding is Fixed or
          Ignored; it rebuilds first when a section was edited. */}
      {showProgress && (
        <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4">
          {openFindings === 0 ? (
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" strokeWidth={3} />
          ) : (
            <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          )}
          <div className="min-w-0 flex-[999_1_320px]">
            <p className="text-sm font-bold text-blue-900">
              {openFindings === 0 ? "All findings dealt with" : "Work through the findings"}
              {totalCount > 0 && (
                <span className="font-semibold tabular-nums text-blue-800">
                  {" "}· {doneCount} of {totalCount} done
                </span>
              )}
            </p>
            {totalCount > 0 && (
              <>
                <div className="mb-1.5 mt-2 h-1.5 max-w-[520px] overflow-hidden rounded-full bg-blue-100">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-[width]"
                    style={{ width: `${Math.round((doneCount / totalCount) * 100)}%` }}
                  />
                </div>
                <p className="text-xs tabular-nums text-blue-800">
                  {fixedFindings} fixed · {ignoredCount} ignored
                  {openFindings > 0 && ` · ${openFindings} still open`}
                </p>
              </>
            )}
            <p className="mt-0.5 text-sm text-blue-800">
              {openFindings > 0
                ? `${openFindings} finding${openFindings === 1 ? "" : "s"} still need${
                    openFindings === 1 ? "s" : ""
                  } Fix or Ignore. When they're all done, you can re-assemble and check the report again.`
                : editedCount > 0
                  ? "Re-assemble and validate to see the new score."
                  : "Validate again to update the scores."}
            </p>
          </div>
          <Button
            onClick={editedCount > 0 ? reassembleAndValidate : run}
            disabled={mustFixFirst}
            title={mustFixFirst ? fixFirstText : undefined}
          >
            {mustFixFirst && <Lock className="mr-1.5 h-4 w-4" />}
            {editedCount > 0 ? "Re-assemble & validate" : "Validate again"}
          </Button>
        </div>
      )}

      {validation ? (
        <ValidationPanel
          validation={validation}
          cycleId={cycleId}
          locked={locked}
          aiSections={aiSections}
          onProgress={onProgress}
        />
      ) : (
        <EmptyState
          icon={ShieldCheck}
          title="Not checked yet"
          description="Validate the report to trace its figures back to what the departments submitted, and to see what the sections claim that nothing supports."
        />
      )}
    </div>
  )
}
