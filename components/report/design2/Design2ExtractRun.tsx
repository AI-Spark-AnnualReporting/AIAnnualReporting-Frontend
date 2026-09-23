"use client"

/**
 * The full-screen run that structures every section before the designer opens.
 *
 * Mounted by the designer itself rather than by the button that leads here, so
 * a refresh mid-run — or someone arriving by URL — still starts it. The screen
 * heals itself: when the run finishes the overlay unmounts and the real
 * designer is underneath, already populated from the mutation responses.
 *
 * Two things that look like bugs and are not:
 *
 *   * Navigating away aborts the client but the writes still land, because
 *     FastAPI does not cancel a handler on disconnect and the model call is
 *     already in flight. That is the right outcome here: someone who wanders
 *     off comes back to finished work, and re-entering costs nothing because
 *     a section whose content has not changed short-circuits.
 *
 *   * Progress counts failures as well as successes. Counting only successes
 *     freezes the bar on a failure, which over nineteen model calls looks
 *     like a hang.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { AiLoadingScreen } from "@/components/report/AiLoadingScreen"
import { design2Api, type DesignSection } from "@/lib/api/design2"
import { mapWithConcurrency } from "@/lib/concurrency"
import { readError, type MutationError } from "@/hooks/useReportBuilder"

const MILESTONES = [
  "Reading the assembled report",
  "Breaking each section into pages",
  "Structuring every page with AI",
]

type Phase = "idle" | "planning" | "extracting" | "done"

// Light the checklist row from the phase we are actually in, rather than
// inferring it from a percentage that means something else.
const PHASE_MILESTONE: Record<Phase, number> = {
  idle: 0,
  planning: 1,
  extracting: 2,
  done: 2,
}

// Each section is one request but several model calls, so four in flight is
// really closer to seven. Enough to keep the wall clock near ninety seconds
// instead of five minutes, without pushing a burst at the model provider or
// starving the render container that also serves real exports.
const CONCURRENCY = 4

export function Design2ExtractRun({
  cycleId,
  sections,
  force,
  onDone,
}: {
  cycleId: string
  sections: DesignSection[]
  force: boolean
  onDone: (failures: Record<string, string>) => void
}) {
  // The work list is a function of the props, so it is computed here rather
  // than discovered in an effect — which also lets the phase start in the
  // right place instead of being corrected on the first render.
  const work = useMemo(
    () => sections.filter((s) => s.eligible && (force || !s.extracted || s.stale)),
    [sections, force],
  )
  const total = work.length
  const unitTotal = work.reduce(
    (n, s) => n + Math.max(1, s.design?.units.length ?? 1),
    0,
  )

  const [phase, setPhase] = useState<Phase>(() =>
    work.length === 0 ? "done" : "extracting",
  )
  const [completed, setCompleted] = useState(0)
  const [failed, setFailed] = useState(0)
  const failures = useRef<Record<string, string>>({})
  // StrictMode runs effects twice in development; a fan-out must not.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    if (work.length === 0) return

    void mapWithConcurrency(
      work,
      CONCURRENCY,
      async (section) => {
        try {
          await design2Api.extract(cycleId, section.section_code, force)
          setCompleted((c) => c + 1)
        } catch (err) {
          failures.current[section.section_code] = readError(
            err as MutationError,
            "Could not structure this section",
          )
          setFailed((f) => f + 1)
          throw err
        }
      },
    ).then(() => setPhase("done"))
  }, [cycleId, work, force])

  const handleDone = useCallback(() => {
    const count = Object.keys(failures.current).length
    if (count > 0) {
      toast.error(
        `${count} section${count === 1 ? "" : "s"} could not be structured. Retry ${
          count === 1 ? "it" : "them"
        } from the list.`,
      )
    }
    onDone(failures.current)
  }, [onDone])

  const settled = completed + failed
  const percent = total > 0 ? Math.round((settled / total) * 100) : 0

  return (
    <div className="fixed inset-0 z-[1400] overflow-y-auto">
      <AiLoadingScreen
        title="Designing your report pages"
        subtitle={
          phase === "extracting" && total > 0
            ? `Structuring section ${Math.min(settled + 1, total)} of ${total} — ${unitTotal} pages in all.`
            : "Reading the assembled report and breaking it into pages."
        }
        milestones={MILESTONES}
        activeMilestone={PHASE_MILESTONE[phase]}
        showProgress={false}
        controlledProgress={percent}
        done={phase === "done"}
        doneTitle="Your pages are ready"
        doneSubtitle={
          failed > 0
            ? `Structured ${completed} of ${total}. ${failed} can be retried from the list.`
            : "Opening the page designer."
        }
        onDone={handleDone}
      />
    </div>
  )
}
