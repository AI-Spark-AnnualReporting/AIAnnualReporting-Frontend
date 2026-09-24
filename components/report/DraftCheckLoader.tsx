"use client"

import { BookOpen, ListChecks, ShieldCheck, Target } from "lucide-react"

import { KickoffLoader } from "@/components/pm/kickoff-loader"

/* Full-screen loader for the draft analysis.
 *
 * The analysis is one model call per department, fired together — about ten
 * seconds. Long enough that a spinning button reads as frozen, so it reuses the
 * kickoff loader with its own, much shorter, stages.
 *
 * Its own component because the analysis is started from the cycle page and
 * re-run from the findings page, and both need the same waiting screen.
 *
 * Icons come from the same family the kickoff loader uses. The big centre icon
 * is whatever the current stage carries, so a warning triangle there read as
 * "something went wrong" on a screen that is only waiting. */

const STAGES = [
  {
    icon: BookOpen,
    title: "Reading each department's draft",
    sub: "Splitting every section into sentences",
    pct: 20,
  },
  {
    icon: ListChecks,
    title: "Checking against what each department said",
    sub: "Looking for claims their answers do not support",
    pct: 50,
  },
  {
    icon: Target,
    title: "Comparing figures across departments",
    sub: "Finding numbers that disagree between sections",
    pct: 78,
  },
  {
    icon: ShieldCheck,
    title: "Collecting what needs your attention",
    sub: "Putting the findings together",
    pct: 94,
  },
]

// Shown once the walkthrough reaches its last stage and the timer stops, so the
// screen never looks frozen while the slowest department is still being read.
const FINALIZING = [
  "Putting the findings together",
  "Almost there — matching figures between departments",
  "Hang tight — this takes longer for cycles with more departments",
]

const TIPS = [
  "Drafts are written from each department's answers alone — anything else was added by the AI.",
  "Only company-wide figures are compared between departments.",
  "Editing a sentence here rewrites it in that department's submitted report.",
  "“Looks right” clears a finding without changing any text.",
]

export function DraftCheckLoader() {
  return (
    <KickoffLoader
      stages={STAGES}
      finalizing={FINALIZING}
      tips={TIPS}
      stageMs={3000}
      title="Analyzing department drafts"
      footer="Please keep this window open — reading every approved department"
    />
  )
}
