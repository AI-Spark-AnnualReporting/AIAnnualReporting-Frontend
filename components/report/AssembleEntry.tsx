"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, FileCheck } from "lucide-react"
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
  useAssembleReport,
  useAssemblyReadiness,
  useFinalReport,
} from "@/hooks/useReportBuilder"
import { SECTION_LAYERS } from "@/lib/constants"

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

// Assembly is one request that reports nothing back until it finishes, so the
// bar is a timed climb rather than a real percentage. This is how long it
// takes to reach 90%, where it then holds: one long LLM call for the summary,
// a short one per narrative section, then the embedding pass. Retune it from a
// real run if reports get much longer — a bar that parks at 90% for a minute
// looks broken.
const ASSEMBLE_ESTIMATE_MS = 60_000

interface AssembleEntryProps {
  cycleId: string
}

export function AssembleEntry({ cycleId }: AssembleEntryProps) {
  const readinessQuery = useAssemblyReadiness(cycleId)
  const finalReportQuery = useFinalReport(cycleId)
  const assemble = useAssembleReport(cycleId)
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  // Drives the loader on its own rather than off `assemble.isPending`: the
  // mutation resolves the instant the response lands, which would tear the
  // screen away mid-animation. "done" lets it finish, then onDone navigates.
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle")

  const goToReport = useCallback(
    () => router.push(`/pm/cycles/${cycleId}/report`),
    [router, cycleId],
  )

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

  const { can_assemble, ready, total, incomplete_sections } = readiness

  // Use the final-report query as the source of truth for whether a report
  // exists — assembly-readiness may not return has_final_report reliably.
  const hasReport = finalReportQuery.isSuccess

  // Final report already exists → View Report only (redirect, no API call).
  // Re-assemble is available on the report page itself.
  if (hasReport) {
    return (
      <Link href={`/pm/cycles/${cycleId}/report`} className="shrink-0">
        <Button className="bg-indigo-600 text-white hover:bg-indigo-700">
          <FileCheck className="h-4 w-4 mr-1.5" />
          View Report
        </Button>
      </Link>
    )
  }

  const run = async () => {
    setConfirmOpen(false)
    setPhase("running")
    try {
      await assemble.mutateAsync({})
      setPhase("done")
    } catch {
      // Error already toasted by the mutation. Drop the loader so the PM lands
      // back on the builder exactly where they were.
      setPhase("idle")
    }
  }

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
