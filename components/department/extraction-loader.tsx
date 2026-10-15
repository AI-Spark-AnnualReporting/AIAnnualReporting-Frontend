"use client"

import { AiLoadingOverlay } from "@/components/report/AiLoadingScreen"

export interface ExtractionResult {
  total_questions: number
  // found_count includes already_answered items (backend convention):
  // found_count + not_found_count === total_questions.
  found_count: number
  not_found_count: number
  // How many questions were already answered before this run. Defaults to 0 for
  // callers that don't supply it.
  already_answered_count?: number
}

/** One line per step, in the order the work happens. */
const STAGES = [
  "Uploading your documents",
  "Reading your questions",
  "Scanning your documents",
  "Connecting the insights",
  "Finding the best answers",
]

// The old design showed a line under each step; those lines now rotate here.
const TIPS = [
  "Your files are sent securely into your workspace.",
  "Each question is read for what it's really asking.",
  "Every page is combed for the relevant detail.",
  "Evidence is linked across all of your documents.",
  "A tailored answer is drafted for every question.",
]

/** About 2.6s a step, as before. */
const ESTIMATED_MS = 13_000

/**
 * Derive the success title + sub-copy from the extraction counts. `found_count`
 * includes answers that were already filled in from a previous run, so we report
 * the *newly* extracted count to avoid overstating what changed.
 */
function extractionSummary(result: ExtractionResult): { title: string; sub: string } {
  const total = result.total_questions
  const alreadyDone = result.already_answered_count ?? 0
  const newlyFound = result.found_count - alreadyDone
  const notFound = result.not_found_count
  const plural = (n: number) => (n === 1 ? "" : "s")

  // Every question was already answered → nothing new to extract.
  if (total > 0 && alreadyDone === total) {
    return {
      title: "Nothing new to extract",
      sub: "All your questions were already answered — nothing new to extract.",
    }
  }

  if (newlyFound > 0 && notFound > 0) {
    return {
      title: "All set — your answers are ready!",
      sub: `We drafted ${newlyFound} new answer${plural(newlyFound)}. ${notFound} still need${
        notFound === 1 ? "s" : ""
      } a supporting document.`,
    }
  }

  if (newlyFound > 0) {
    return {
      title: "All set — your answers are ready!",
      sub: `We drafted ${newlyFound} new answer${plural(newlyFound)}. Let's review them together.`,
    }
  }

  // Ran, but the new document(s) covered nothing.
  return {
    title: "No new answers found",
    sub: "We couldn't find any new answers in your documents — you can still answer each question manually.",
  }
}

/**
 * Full-screen loader while the backend uploads documents and extracts answers
 * for the department user. Once `result` arrives it settles on a finished
 * state worded from the counts; the parent owns the redirect after a pause.
 *
 * Only the wording lives here. The look is the app-wide AiLoadingOverlay, so
 * this wait reads the same as every other in the app.
 */
export function ExtractionLoader({ result }: { result: ExtractionResult | null }) {
  // From the NEWLY extracted count, not raw found_count, which also includes
  // answers kept from a previous run.
  const summary = result ? extractionSummary(result) : null
  return (
    <AiLoadingOverlay
      title="Extracting your answers"
      subtitle="Reading your documents to answer each of your questions."
      milestones={STAGES}
      tips={TIPS}
      estimatedMs={ESTIMATED_MS}
      showProgress={false}
      done={result !== null}
      doneTitle={summary?.title}
      doneSubtitle={summary?.sub}
    />
  )
}
