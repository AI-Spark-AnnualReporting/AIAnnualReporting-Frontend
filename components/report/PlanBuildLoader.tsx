"use client"

import { PipelineLoader, type PipelineStage } from "./PipelineLoader"

/* Full-screen loader while the report theme and outline are generated.
 *
 * Two AI passes over every approved department's content — 30 to 60 seconds,
 * which is why the stages hold longer here than in the draft check. */

const STAGES: PipelineStage[] = [
  {
    label: "Reading your approved department content",
    subtitle: "Gathering what every department submitted.",
    pct: 18,
  },
  {
    label: "Proposing a headline and themes",
    subtitle: "Finding the story the year's content tells.",
    pct: 44,
  },
  {
    label: "Matching sections to departments",
    subtitle: "Deciding which department feeds each section.",
    pct: 72,
  },
  {
    label: "Saving the outline",
    subtitle: "Putting the plan together for your review.",
    pct: 91,
  },
]

const TIPS = [
  "Every title, theme and source is editable once the plan is generated.",
  "Nothing is written yet — this proposes the outline, not the report.",
  "You can regenerate the plan if the headline or themes miss the mark.",
  "Sections are matched to the departments whose content best fits them.",
]

export function PlanBuildLoader() {
  return (
    <PipelineLoader
      title="Building your report plan"
      stages={STAGES}
      tips={TIPS}
      // Roughly 45s across four stages — the run is slower than the draft check.
      stageMs={11000}
    />
  )
}
