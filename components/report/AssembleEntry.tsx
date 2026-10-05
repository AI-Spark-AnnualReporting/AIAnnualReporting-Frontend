"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { AlertTriangle, FileCheck, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AiLoadingScreen } from "@/components/report/AiLoadingScreen"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  readError,
  useAssemblyReadiness,
  useFinalReport,
  type MutationError,
} from "@/hooks/useReportBuilder"
import { pmApi } from "@/lib/api/pm"
import { QUERY_KEYS, SECTION_LAYERS } from "@/lib/constants"
import type { FinalReport } from "@/types"

// The four phases assemble_report actually runs, in order: read the sections,
// write the executive summary from the AI-written ones, lay the report out
// (including the per-section title-echo pass), then save it and index it for
// the dashboard.
const ASSEMBLE_MILESTONES = [
  "Collecting your written sections",
  "Writing the executive summary",
  "Laying out the report",
  "Saving and indexing it",
]

const ASSEMBLE_TIPS = [
  "Empty sections are skipped — assemble again once you have filled them in.",
  "The executive summary is written last, from the sections the AI wrote.",
  "Assembling is not approving — you review the whole report before signing it off.",
  "Attached documents go into the report exactly as you uploaded them.",
]

// The server reports no progress at all — only, eventually, a saved report —
// so the bar is a timed climb rather than a real percentage. This is how long it
// takes to reach 90%, where it then holds: one long LLM call for the summary,
// a short one per narrative section, then the embedding pass. Retune it from a
// real run if reports get much longer — a bar that parks at 90% for a minute
// looks broken.
const ASSEMBLE_ESTIMATE_MS = 60_000

// Assembling runs in the background on the server: the click only STARTS it,
// then the builder checks every POLL_INTERVAL_MS whether a newer report has
// been saved. No request waits for the whole assemble, so none can time out
// halfway — which is what used to drop the PM back on the builder while the
// server finished anyway.
const POLL_INTERVAL_MS = 3_000
// The server stores nothing about a run, so a failed one is only noticed by
// no report ever appearing. A normal run takes one to two minutes.
const POLL_GIVE_UP_MS = 8 * 60_000

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface AssembleEntryProps {
  cycleId: string
}

export function AssembleEntry({ cycleId }: AssembleEntryProps) {
  const readinessQuery = useAssemblyReadiness(cycleId)
  const finalReportQuery = useFinalReport(cycleId)
  const qc = useQueryClient()
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  // "running" shows the loader while we poll. "done" lets it finish its
  // animation, then onDone navigates. "failed" swaps it for an error card —
  // the PM leaves that only by clicking, never by being dropped back.
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "failed">(
    "idle",
  )
  const [failureMessage, setFailureMessage] = useState("")
  // Remembered so "Try again" on the error card re-runs the same kind of build.
  const [lastRefresh, setLastRefresh] = useState(false)
  // Stops a second polling loop starting (a fast "Try again", say).
  const pollingRef = useRef(false)
  // Stops a polling loop once the PM has left the builder.
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const goToReport = useCallback(
    () => router.push(`/pm/cycles/${cycleId}/report`),
    [router, cycleId],
  )

  const showFailure = (message: string) => {
    setFailureMessage(message)
    setPhase("failed")
  }

  // The run succeeded: put the new report into the cache the report page
  // reads, refresh the builder's own queries, and let the loader finish.
  const finishWithReport = (report: FinalReport) => {
    qc.setQueryData<FinalReport>(QUERY_KEYS.PM_FINAL_REPORT(cycleId), report)
    qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_ASSEMBLY_READINESS(cycleId) })
    qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_ASSEMBLED_REPORT(cycleId) })
    toast.success("Report assembled")
    setPhase("done")
  }

  // Is `report` one saved by this run, rather than the one already there?
  // generated_at is the row's updated_at, stamped by a DB trigger on every
  // save, so this compares two server timestamps — never the browser clock.
  // With no report before the click, any report at all is new.
  const isNewReport = (
    previousGeneratedAt: string | null,
    report: FinalReport,
  ): boolean => {
    if (previousGeneratedAt == null) return true
    return !!report.generated_at && report.generated_at !== previousGeneratedAt
  }

  // Check for a newer report until one appears. A failed check — 404 before
  // the first report is saved, a network blip, the dev server restarting —
  // is just "not yet": the run lives on the server, not in this request.
  const pollUntilFinished = async (previousGeneratedAt: string | null) => {
    if (pollingRef.current) return
    pollingRef.current = true
    const giveUpAt = Date.now() + POLL_GIVE_UP_MS
    try {
      while (Date.now() < giveUpAt) {
        await wait(POLL_INTERVAL_MS)
        if (!mountedRef.current) return
        try {
          const report = await pmApi.getFinalReport(cycleId)
          if (isNewReport(previousGeneratedAt, report)) {
            finishWithReport(report)
            return
          }
        } catch {
          // not saved yet
        }
      }
      showFailure(
        "Assembling didn't finish. It may have hit an error — please try again.",
      )
    } finally {
      pollingRef.current = false
    }
  }

  const runAssemble = async (refresh: boolean) => {
    setConfirmOpen(false)
    setLastRefresh(refresh)
    setPhase("running")
    // The report as it was before this click, so the one THIS run saves can be
    // told apart from it.
    const previousGeneratedAt = finalReportQuery.data?.generated_at ?? null
    try {
      // Answers straight away. If a run is already going it joins that one
      // instead of starting another, so polling below covers both.
      await pmApi.startAssemble(cycleId, refresh)
    } catch (err) {
      // A refusal (locked, nothing to assemble, no access) or no server.
      showFailure(
        readError(err as MutationError, "Couldn't start assembling the report."),
      )
      return
    }
    await pollUntilFinished(previousGeneratedAt)
  }

  if (phase === "failed") {
    return (
      <AssembleFailedCard
        message={failureMessage}
        onRetry={() => runAssemble(lastRefresh)}
        onBack={() => setPhase("idle")}
      />
    )
  }

  // Before every other early return: assembling makes the final-report query
  // succeed, and the `hasReport` branch below would swap the loader out for a
  // "View Report" link halfway through its finish animation.
  if (phase !== "idle") {
    return (
      <div className="fixed inset-0 z-[1400] overflow-y-auto">
        <AiLoadingScreen
          title="Assembling your report"
          subtitle="Pulling every written section together and writing the executive summary."
          milestones={ASSEMBLE_MILESTONES}
          tips={ASSEMBLE_TIPS}
          estimatedMs={ASSEMBLE_ESTIMATE_MS}
          done={phase === "done"}
          doneTitle="Your report is assembled"
          doneSubtitle="Opening it so you can review and sign it off."
          onDone={goToReport}
        />
      </div>
    )
  }

  if (readinessQuery.isLoading) {
    return (
      <span className="h-10 w-44 rounded-lg bg-slate-100 animate-pulse shrink-0" />
    )
  }

  const readiness = readinessQuery.data
  if (!readiness) return null

  const { can_assemble, ready, total, incomplete_sections, stale } = readiness

  // Use the final-report query as the source of truth for whether a report
  // exists — assembly-readiness may not return has_final_report reliably.
  const hasReport = finalReportQuery.isSuccess

  // A report exists and nothing has changed since → nothing to do but read it.
  if (hasReport && !stale) {
    return (
      <Link href={`/pm/cycles/${cycleId}/report`} className="shrink-0">
        <Button className="bg-indigo-600 text-white hover:bg-indigo-700">
          <FileCheck className="h-4 w-4 mr-1.5" />
          View Report
        </Button>
      </Link>
    )
  }

  // A report exists but a section has been edited since it was built. Offer
  // the rebuild instead of the link — refresh: true is what makes it a rebuild
  // rather than a re-read, since assemble_report returns the stored report
  // untouched without it.
  if (hasReport) {
    return (
      <Button
        onClick={() => runAssemble(true)}
        className="shrink-0 bg-amber-500 text-white hover:bg-amber-600"
        title="A section changed after this report was built — rebuild it to include the change."
      >
        <RefreshCw className="h-4 w-4 mr-1.5" />
        Assemble again
      </Button>
    )
  }

  const run = () => runAssemble(false)

  const missing = incomplete_sections.length

  return (
    <>
      <Button
        // Assembling with empty sections is allowed — they are simply left
        // out. The confirm below is what stops that happening silently.
        onClick={() => (missing > 0 ? setConfirmOpen(true) : run())}
        disabled={!can_assemble}
        title={
          can_assemble
            ? undefined
            : "Nothing has been written yet — there is no report to assemble."
        }
        className="shrink-0 bg-indigo-600 text-white hover:bg-indigo-700"
      >
        <FileCheck className="h-4 w-4 mr-1.5" />
        Assemble Report
        {missing > 0 && (
          <span className="ml-1.5 font-normal opacity-80">
            ({ready}/{total})
          </span>
        )}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {missing} section{missing === 1 ? "" : "s"} will be left out
            </DialogTitle>
            <DialogDescription>
              Nothing has been written in {missing === 1 ? "it" : "them"} yet,
              so {missing === 1 ? "it" : "they"} won&apos;t appear in the
              report. You can assemble again after filling{" "}
              {missing === 1 ? "it" : "them"} in.
            </DialogDescription>
          </DialogHeader>

          <ul className="max-h-[240px] space-y-1 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/60 p-3">
            {incomplete_sections.map((s) => (
              <li
                key={s.section_code}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="truncate text-slate-700">{s.title}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {SECTION_LAYERS[s.layer]?.label ?? s.layer}
                </span>
              </li>
            ))}
          </ul>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Keep editing
            </Button>
            <Button
              onClick={run}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Assemble anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

interface AssembleFailedCardProps {
  message: string
  onRetry: () => void
  onBack: () => void
}

// Shown over the builder, on the loader's own backdrop, when assembling
// failed. The PM chooses what happens next.
function AssembleFailedCard({ message, onRetry, onBack }: AssembleFailedCardProps) {
  return (
    <div
      role="alertdialog"
      aria-labelledby="assemble-failed-title"
      className="fixed inset-0 z-[1400] flex items-center justify-center overflow-y-auto p-5"
      style={{
        background:
          "radial-gradient(120% 80% at 50% -10%, #EEEFFE 0%, #F4F5FB 45%, #F4F5FB 100%)",
      }}
    >
      <div className="w-full max-w-[520px] rounded-2xl border border-[#E2E4F0] bg-white px-8 py-9 text-center shadow-[0_30px_70px_rgba(20,22,40,.14)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
        </div>
        <h2
          id="assemble-failed-title"
          className="mt-4 text-xl font-bold text-slate-900"
        >
          We couldn&apos;t assemble the report
        </h2>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <p className="mt-1 text-xs text-slate-400">
          Your sections are safe — nothing you wrote was changed.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={onBack}>
            Back to builder
          </Button>
          <Button
            onClick={onRetry}
            className="bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Try again
          </Button>
        </div>
      </div>
    </div>
  )
}
