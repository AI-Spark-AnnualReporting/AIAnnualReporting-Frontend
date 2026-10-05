"use client"

import { use, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ShieldCheck } from "lucide-react"

import { RouteGuard } from "@/components/auth/RouteGuard"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { PageLoader } from "@/components/ui/spinner"
import { ReportValidateLoader } from "@/components/report/ReportValidateLoader"
import { ValidationPanel } from "@/components/report/ValidationPanel"
import {
  useFinalReport,
  useReportApproval,
  useValidateReport,
} from "@/hooks/useReportBuilder"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { formatDateTime } from "@/lib/utils"

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

  const run = () => {
    setRunning(true)
    validate.mutate(undefined, { onSettled: () => setRunning(false) })
  }

  // A loader must never be able to outlive its request. Runs take 20-45s; if
  // nothing has cleared this after three minutes then the settle never reached
  // us — a dev-server restart killing the connection will do it — and the PM is
  // left staring at a spinner for work that has already finished.
  //
  // The server stores the result before it answers, so refetching shows it
  // whatever happened to the response.
  useEffect(() => {
    if (!running) return
    const t = setTimeout(() => {
      setRunning(false)
      reportQuery.refetch()
    }, 180_000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

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
  const validation = validate.data?.validation ?? reportQuery.data?.validation ?? null

  if (running) return <ReportValidateLoader />
  if (reportQuery.isLoading) return <PageLoader />

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
            <Button
              variant="outline"
              onClick={run}
              disabled={running || locked}
              title={
                locked
                  ? "This report is approved. Its validation is kept as the record behind the Validation Report page."
                  : undefined
              }
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              {validation ? "Validate again" : "Validate report"}
            </Button>
          }
        />
      </div>

      {validation ? (
        <ValidationPanel validation={validation} />
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
