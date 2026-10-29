"use client"

/**
 * The full-screen run that structures every section before the designer opens.
 *
 * Mounted by the designer itself rather than by the button that leads here, so
 * a refresh mid-run — or someone arriving by URL — still starts it. The screen
 * heals itself: when the run finishes the overlay unmounts and the real
 * designer is underneath, already populated from the mutation responses.
 *
 * Each section is STARTED on the server (it answers at once) and the screen
 * then reads the cycle back until the section shows as extracted — the same
 * start-then-poll pattern as the annual report's assemble. It used to hold one
 * long request open per section, and a request cut off in the browser lost the
 * screen while the server finished the section anyway.
 *
 * Two things that look like bugs and are not:
 *
 *   * Navigating away stops the polling but not the work: the server carries
 *     on and saves every section. Someone who wanders off comes back to
 *     finished work, and re-entering costs nothing because a section whose
 *     content has not changed short-circuits.
 *
 *   * Progress counts failures as well as successes. Counting only successes
 *     freezes the bar on a failure, which over nineteen model calls looks
 *     like a hang.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { AiLoadingScreen } from "@/components/report/AiLoadingScreen"
import { createDesignApi, type CycleDesign, type DesignSection } from "@/lib/api/createDesign"
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

// Starting a section is quick, but each start still costs an auth check and a
// cycle read, so they go four at a time rather than all at once. The limit on
// model calls itself now lives on the server (MAX_BACKGROUND_EXTRACTS).
const CONCURRENCY = 4

// How often to read the cycle back while sections are being structured.
const POLL_INTERVAL_MS = 3_000

// The server stores nothing about a run, so a section that failed is only
// noticed by it never reading as done. Give up on whatever is left once
// nothing new has finished for as long as one request used to be allowed
// (the old per-section timeout); those sections can be retried from the list.
const STALL_GIVE_UP_MS = 180_000

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Has this section been structured by this run?
 *
 * Extracted and not stale is enough for an ordinary run. A forced run also
 * needs a new extracted_at, because the old envelope already reads as
 * extracted — the server stamps extracted_at on every save, so comparing it
 * with the value from before the run compares two server timestamps.
 */
function isFinished(
  section: DesignSection | undefined,
  previousExtractedAt: string | null,
  force: boolean,
): boolean {
  if (!section || !section.extracted || section.stale) return false
  if (!force) return true
  const extractedAt = section.design?.source.extracted_at ?? null
  return extractedAt !== null && extractedAt !== previousExtractedAt
}

export function CreateDesignExtractRun({
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
  // Stops the polling loop once this screen has gone. Set back to true on every
  // setup, so StrictMode's mount → unmount → mount in development does not
  // stop the one loop that is running.
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (started.current) return
    started.current = true

    if (work.length === 0) return

    // Each section's extracted_at before this run, for isFinished.
    const previous = new Map(
      work.map((s) => [s.section_code, s.design?.source.extracted_at ?? null]),
    )
    // Sections started and not yet read back as done.
    const waiting = new Set<string>()

    const markFailed = (sectionCode: string, message: string) => {
      failures.current[sectionCode] = message
      setFailed((f) => f + 1)
    }

    const startAll = () =>
      mapWithConcurrency(work, CONCURRENCY, async (section) => {
        try {
          await createDesignApi.startExtract(cycleId, section.section_code, force)
          waiting.add(section.section_code)
        } catch (err) {
          // Refused, or no server: this section never started.
          markFailed(
            section.section_code,
            readError(err as MutationError, "Could not structure this section"),
          )
        }
      })

    // Read the cycle back until every started section reads as done. A failed
    // read — a network blip, the dev server restarting — is just "not yet":
    // the work lives on the server, not in this request.
    const pollUntilFinished = async () => {
      let lastProgressAt = Date.now()
      while (waiting.size > 0) {
        await wait(POLL_INTERVAL_MS)
        if (!mounted.current) return

        let cycle: CycleDesign | null = null
        try {
          cycle = await createDesignApi.get(cycleId)
        } catch {
          cycle = null
        }
        if (cycle) {
          for (const sectionCode of [...waiting]) {
            const section = cycle.sections.find((s) => s.section_code === sectionCode)
            if (isFinished(section, previous.get(sectionCode) ?? null, force)) {
              waiting.delete(sectionCode)
              setCompleted((c) => c + 1)
              lastProgressAt = Date.now()
            }
          }
        }

        if (waiting.size > 0 && Date.now() - lastProgressAt > STALL_GIVE_UP_MS) {
          for (const sectionCode of waiting) {
            markFailed(sectionCode, "This section did not finish. Retry it from the list.")
          }
          waiting.clear()
        }
      }
    }

    void startAll()
      .then(pollUntilFinished)
      .then(() => setPhase("done"))
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
