"use client"

import { AiLoadingOverlay } from "@/components/report/AiLoadingScreen"

/**
 * Full-screen loader while headings and subheadings are drawn from a
 * department's answers. The work isn't streamed, so the steps are paced on a
 * timer.
 *
 * Only the wording lives here. The look is the app-wide AiLoadingOverlay, so
 * this wait reads the same as every other in the app.
 */

const STAGES = [
  "Reading your answers",
  "Grouping related answers",
  "Identifying the key sections",
  "Drafting headings & subheadings",
  "Mapping answers to each section",
  "Polishing the outline",
]

const TIPS = [
  "Your outline is built only from the answers you provided — nothing is invented.",
  "You can rename any heading or subheading, but the structure stays fixed.",
  "Each subheading maps to the specific answers it draws from.",
  "A clear outline helps the generated draft read better.",
]

export function OutlineBuildLoader() {
  return (
    <AiLoadingOverlay
      title="Building your outline"
      subtitle="Sit tight while we shape headings and subheadings from your answers."
      milestones={STAGES}
      tips={TIPS}
      estimatedMs={40_000}
      showProgress={false}
    />
  )
}
