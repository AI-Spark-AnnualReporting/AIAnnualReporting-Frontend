"use client"

import { AiLoadingOverlay } from "@/components/report/AiLoadingScreen"

/**
 * Full-screen "Building your intelligence dashboard" loader shown while the
 * kickoff pipeline generates each department's questions. The backend work
 * isn't streamed, so progress + stages are simulated on a timer to give the PM
 * a clear sense of activity during a long (up to ~3 min) wait.
 *
 * Rendered through a portal to <body> so it truly covers the viewport — a
 * plain `fixed inset-0` gets trapped by ancestors that establish a containing
 * block (the page's `overflow-y-auto` main + the sticky `backdrop-blur` footer),
 * which would otherwise clip it to a band. Critical layout (the overlay
 * background + card width) is set inline so it never depends on a utility class.
 */

// Pipeline stages, cycled as the simulated progress climbs. These mirror the
// kickoff question-generation flow: brief → themes → per-department → drafting →
// polishing → QA.
const KICKOFF_STAGES = [
  "Reading your strategic brief…",
  "Identifying key themes & KPIs…",
  "Mapping each department's angle…",
  "Drafting tailored questions…",
  "Polishing the question set…",
  "Running a final quality check…",
]

// Playful "working" words that rotate under the stage line (à la Splunking…).
// Rotating "Did you know?" facts shown in the footer card.
const KICKOFF_TIPS = [
  "Your agents use GRI, IFRS, and SAMA frameworks to generate questions tailored to your sector.",
  "Every department gets its own tailored question set — never copy-pasted.",
  "Naming specific KPIs in your brief helps the AI ask measurable questions.",
  "You can review and edit every question once they're generated.",
]

/** Copy for the concept-message pass — same loader, different narration. */
export const CONCEPT_MESSAGE_LOADER = {
  title: "Writing your concept messages",
  subtitle: "One message per area of focus, in your report's voice.",
  stages: [
    "Reading your areas of focus…",
    "Weighing the primary slogan…",
    "Shaping each concept…",
    "Writing the brand copy…",
    "Tightening the language…",
    "Running a final read-through…",
  ],
  tips: [
    "Each concept message is brand copy written in your company's own voice.",
    "Your primary area leads — its message is written first and shown at the top.",
    "Areas you left unmarked don't get a message at all.",
    "Every title and description is editable once they're written.",
  ],
} as const

/** Copy for approving the client's brief, which commissions BOTH the areas of
 *  focus and a concept message for each — two LLM calls in one request, so the
 *  wait is the longest in the wizard and has to be narrated. */
export const BRIEF_SIGNOFF_LOADER = {
  estimatedMs: 60_000,
  title: "Writing your areas of focus and concept messages",
  subtitle: "Both are drawn from the brief your client just signed off.",
  stages: [
    "Reading the approved brief…",
    "Drawing out the areas of focus…",
    "Shaping each slogan…",
    "Writing a concept message for each area…",
    "Tightening the language…",
    "Running a final read-through…",
  ],
  tips: [
    "The areas of focus come from the brief, so they follow what you both agreed.",
    "One concept message is written per area, in your company's own voice.",
    "The brief is locked from here — everything below is built on it.",
    "Every slogan and message stays editable afterwards.",
  ],
} as const

/** Copy for the initial generate-brief call, which returns BOTH the strategic
 *  brief and the first set of areas of focus. */
export const BRIEF_LOADER = {
  estimatedMs: 45_000,
  title: "Writing your strategic direction",
  subtitle: "The brief, the areas of focus, and the message behind each one.",
  // Three things now, not two: the concept messages are written in this same
  // run so the client can be shown the whole thing at once. The stages say so,
  // because a loader that stops describing what it is doing is a loader people
  // assume has hung.
  stages: [
    "Reading your answers…",
    "Reading the client's document…",
    "Shaping the objective & narrative…",
    "Writing the strategic brief…",
    "Proposing areas of focus…",
    "Writing a concept message for each…",
    "Running a final read-through…",
  ],
  tips: [
    "One run writes all three: the brief, the areas of focus, and a message for each.",
    "Everything here is a draft — you can edit or refine all of it afterwards.",
    "The document your client attached steers the draft closer to it.",
    "Once this goes to the client it can't be regenerated — only edited by hand.",
  ],
} as const

/** Spark's generate-brief: the brief ALONE. The areas of focus and their
 *  concept messages are only written once the client approves this brief, so
 *  the steps must not promise them. */
export const BRIEF_ONLY_LOADER = {
  estimatedMs: 30_000,
  title: "Writing your strategic brief",
  subtitle: "Drawn from your client's answers and their document.",
  stages: [
    "Reading your answers…",
    "Reading the client's document…",
    "Shaping the objective & narrative…",
    "Writing the strategic brief…",
    "Running a final read-through…",
  ],
  tips: [
    "The brief is a draft. You can edit or refine it afterwards.",
    "The document your client attached steers the draft closer to it.",
    "The areas of focus are written once your client approves this brief.",
    "Once this goes to the client it can't be regenerated, only edited by hand.",
  ],
} as const

/** Copy for the areas-of-focus rewrite that follows a brief change. */
export const AREAS_REFRESH_LOADER = {
  title: "Updating your areas of focus",
  subtitle: "Rewriting them to match your revised strategic brief.",
  stages: [
    "Reading the revised brief…",
    "Checking each area against it…",
    "Reworking the slogans…",
    "Tightening the wording…",
    "Running a final read-through…",
  ],
  tips: [
    "Areas of focus are drawn from the brief — a change to one reshapes the other.",
    "Your Primary and Secondary picks survive the rewrite.",
    "Every slogan stays editable afterwards.",
    "Prefer a smaller change? Refine a single area from its own card instead.",
  ],
} as const

export function KickoffBuildLoader({
  title = "Generating your questions",
  subtitle = "Sit tight while we craft a tailored question set for every department.",
  stages = KICKOFF_STAGES,
  tips = KICKOFF_TIPS,
  estimatedMs,
}: {
  title?: string
  subtitle?: string
  stages?: readonly string[]
  tips?: readonly string[]
  /** How long the work usually takes; the bar paces itself to it. */
  estimatedMs?: number
} = {}) {
  // The wording above is all that is specific to this loader — the look is
  // the app-wide one, so a long wait here reads the same as everywhere else.
  return (
    <AiLoadingOverlay
      title={title}
      subtitle={subtitle}
      milestones={stages.map((s) => s.replace(/…$/, ""))}
      tips={[...tips]}
      // Paces which step is shown as active; no bar, as on the report builder.
      estimatedMs={estimatedMs}
      showProgress={false}
    />
  )
}
