"use client"

import { AiLoadingOverlay } from "@/components/report/AiLoadingScreen"

/**
 * Full-screen loader while the kickoff generates every department's questions
 * — up to ~3 minutes, and not streamed, so the steps are paced on a timer.
 *
 * Only the wording lives here. The look is the app-wide AiLoadingOverlay, so
 * this wait reads the same as the report builder's and every other.
 */

const STAGES = [
  "Reading your strategic brief",
  "Identifying key themes & KPIs",
  "Mapping each department",
  "Drafting tailored questions",
  "Polishing the question set",
  "Final quality check",
]

const TIPS = [
  "A detailed strategic brief produces sharper, less generic questions.",
  "Every department gets its own tailored question set — never copy-pasted.",
  "You can review and edit every question once they're generated.",
  "Naming specific KPIs in your brief helps the AI ask measurable questions.",
  "Questions are written to draw out evidence, not just yes/no answers.",
]

/** Roughly how long generation takes, so the steps pace across the real wait
 *  rather than reaching the last one in seconds and sitting there. */
const ESTIMATED_MS = 150_000

export function KickoffLoader() {
  return (
    <AiLoadingOverlay
      title="Generating your questions"
      subtitle="A tailored question set for every department, drawn from your strategic brief."
      milestones={STAGES}
      tips={TIPS}
      estimatedMs={ESTIMATED_MS}
      showProgress={false}
    />
  )
}
