"use client"

import { PipelineLoader, type PipelineStage } from "./PipelineLoader"

/* Full-screen loader for the draft analysis.
 *
 * One model call per department, fired together — roughly ten to thirty
 * seconds. Long enough that a spinning button reads as frozen, so this narrates
 * the pipeline instead.
 *
 * Its own component because the analysis is started from the cycle page and
 * re-run from the findings page, and both need the same waiting screen. */

const STAGES: PipelineStage[] = [
  {
    label: "Reading each department's draft",
    subtitle: "Splitting every approved section into sentences.",
    pct: 22,
  },
  {
    label: "Checking each sentence against its own facts",
    subtitle: "Looking for claims the department's answers don't support.",
    pct: 48,
  },
  {
    label: "Comparing figures between departments",
    subtitle: "Finding numbers that disagree between departments.",
    pct: 74,
  },
  {
    label: "Collecting what needs your attention",
    subtitle: "Putting the findings together.",
    pct: 92,
  },
]

const TIPS = [
  "Drafts are written from each department's answers alone — anything else was added by the AI.",
  "Only company-wide figures are compared between departments.",
  "Editing a sentence here rewrites it in that department's submitted report.",
  "“Looks right” clears a finding without changing any text.",
]

export function DraftCheckLoader() {
  return (
    <PipelineLoader
      title="Analyzing department drafts"
      stages={STAGES}
      tips={TIPS}
    />
  )
}
