"use client"

import { AiLoadingOverlay } from "@/components/report/AiLoadingScreen"

/**
 * Full-screen loader while a department's answers and outline are turned into
 * a full draft. The work isn't streamed, so the steps are paced on a timer.
 *
 * Only the wording lives here. The look is the app-wide AiLoadingOverlay, so
 * this wait reads the same as every other in the app.
 */

const STAGES = [
  "Reading your outline",
  "Pulling in your answers",
  "Structuring each section",
  "Writing the narrative",
  "Weaving in the details",
  "Polishing the language",
]

const TIPS = [
  "Your draft is written from your answers and the headings you set.",
  "Once it's ready you can edit any part — changes save as you type.",
  "Prefer a different tone? Adjust it in one click after the draft loads.",
  "Regenerating rebuilds the draft from your latest answers and headings.",
]

export function DraftBuildLoader() {
  return (
    <AiLoadingOverlay
      title="Writing your draft"
      subtitle="Sit tight while we turn your answers and outline into a full draft."
      milestones={STAGES}
      tips={TIPS}
      estimatedMs={60_000}
      showProgress={false}
    />
  )
}
