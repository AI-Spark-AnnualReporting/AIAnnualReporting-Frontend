"use client"

import { PipelineLoader, type PipelineStage } from "./PipelineLoader"

/* Full-screen loader while the assembled report is validated.
 *
 * Two passes server-side — every section read in batches, then a handful of
 * judgements across what those returned — so roughly 30 seconds on a large
 * report. The stages mirror that shape rather than inventing a narrative. */

const STAGES: PipelineStage[] = [
  {
    label: "Tracing every figure to its department",
    subtitle: "Matching each number against what the departments submitted.",
    pct: 20,
  },
  {
    label: "Reading each section of the report",
    subtitle: "Checking what the sections claim against the facts behind them.",
    pct: 52,
  },
  {
    label: "Comparing sections against each other",
    subtitle: "Looking for figures that disagree and points made twice.",
    pct: 76,
  },
  {
    label: "Checking it against the brief",
    subtitle: "Confirming the report delivers what the cycle set out to report.",
    pct: 92,
  },
]

const TIPS = [
  "Only the figure count is printed in the report — everything else stays here.",
  "A figure traces when some department actually submitted it.",
  "The executive summary is checked too: it is written last, from the sections.",
  "Findings never block approval or export — they are for you to weigh.",
]

/** `stage` is the server's own progress line for the running job, when known. */
export function ReportValidateLoader({ stage }: { stage?: string | null } = {}) {
  return (
    <PipelineLoader
      title="Validating your report"
      stages={STAGES}
      tips={TIPS}
      // ~30s across four stages, against the draft check's faster run.
      stageMs={7500}
      live={stage}
    />
  )
}
