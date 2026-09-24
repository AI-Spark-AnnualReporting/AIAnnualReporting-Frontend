/**
 * Turning questionnaire answers into the API's shape, and back again.
 *
 * The wire format is lossy on purpose: every chip a person picked plus anything
 * they typed is joined into ONE comma-separated string per question, because
 * that is what generate-brief consumes. Reading it back therefore means
 * guessing which pieces were chips — see `splitAnswer`.
 *
 * This lives apart from the component so the round-trip can be tested without a
 * DOM. It is the kind of parsing that fails silently: get it wrong and the PM
 * sees a form full of unselected chips, with the client's actual answer nowhere
 * on screen, and nothing anywhere reports an error.
 */

import type { SurveyQuestion, GenerateBriefAnswer } from "@/lib/api/pm"

/** Per-question answer. `selected` holds every preset chip toggled on
 *  (multi-select — any number at once). `custom` holds written-in answers,
 *  committed one pill at a time from the "Other…" box. `text` is the plain
 *  answer (no-options mode) or the uncommitted draft still sitting in the
 *  "Other…" box — it counts either way, so someone who types and submits
 *  without pressing Enter doesn't lose it. */
export interface Answer {
  selected: string[]
  custom: string[]
  text: string
}

export const emptyAnswer: Answer = { selected: [], custom: [], text: "" }

/** Answers and rejections, both keyed by array position — NOT by q.id. The
 *  backend doesn't guarantee `id` is unique across a cycle's questions, only
 *  that ORDER is stable. Keying by id let two questions sharing an id share one
 *  answer slot, which showed up as "picking a chip in one question also selects
 *  it in another". */
export interface QuestionnaireValue {
  answers: Record<number, Answer>
  rejected: Record<number, boolean>
}

export const emptyQuestionnaireValue: QuestionnaireValue = { answers: {}, rejected: {} }

export function isAnswered(a: Answer | undefined) {
  if (!a) return false
  return a.selected.length > 0 || a.custom.length > 0 || a.text.trim().length > 0
}

/** Rejected questions leave the numerator AND the denominator — they don't
 *  need answering, so they must not make the form look incomplete forever. */
export function answeredCount(questions: SurveyQuestion[], v: QuestionnaireValue) {
  return questions.reduce(
    (n, _q, i) => n + (!v.rejected[i] && isAnswered(v.answers[i]) ? 1 : 0),
    0,
  )
}

export function requiredCount(questions: SurveyQuestion[], v: QuestionnaireValue) {
  return questions.reduce((n, _q, i) => n + (v.rejected[i] ? 0 : 1), 0)
}

/** `required > 0` also blocks the everything-rejected case, which would
 *  otherwise generate a brief from an empty answer set. */
export function isComplete(questions: SurveyQuestion[], v: QuestionnaireValue) {
  const required = requiredCount(questions, v)
  return required > 0 && answeredCount(questions, v) === required
}

/** One entry per ANSWERED question — unanswered and rejected ones are omitted
 *  (there is no server-side required-count check). Multi-select chips + every
 *  custom pill are joined into a single comma-separated string per the API
 *  contract. */
export function buildAnswersPayload(
  questions: SurveyQuestion[],
  v: QuestionnaireValue,
): GenerateBriefAnswer[] {
  return questions.reduce<GenerateBriefAnswer[]>((acc, q, i) => {
    const a = v.answers[i]
    if (!a || v.rejected[i]) return acc
    const parts = [...a.selected, ...a.custom, a.text.trim()].filter(Boolean)
    if (parts.length === 0) return acc
    acc.push({ question_id: q.id, answer: parts.join(", ") })
    return acc
  }, [])
}

/** Undo the join above, so a stored answer lights its chips back up instead of
 *  arriving as one anonymous string.
 *
 *  Matching walks the raw answer rather than splitting on ", " first, because an
 *  option may itself contain a comma ("Investors, analysts and lenders") and a
 *  naive split would shred it into two pieces that match nothing. Options are
 *  tried longest-first so one that merely starts with another can't be stolen
 *  by the shorter one.
 *
 *  Whatever matches no option was written in by hand, so it comes back as a
 *  custom pill — never as `text`, which the read-only view doesn't render. */
export function splitAnswer(answer: string, options: string[]): Answer {
  const byLongest = [...options].sort((a, b) => b.length - a.length)
  const selected: string[] = []
  const custom: string[] = []
  let rest = answer.trim()

  while (rest.length > 0) {
    const option = byLongest.find((o) => rest === o || rest.startsWith(o + ", "))
    if (option) {
      selected.push(option)
      rest = rest.slice(option.length).replace(/^,\s*/, "")
      continue
    }
    // Nothing matched, so the next comma-delimited piece is the person's own
    // wording. Take one piece and try the options again on what's left.
    const comma = rest.indexOf(", ")
    const piece = comma === -1 ? rest : rest.slice(0, comma)
    if (piece.trim()) custom.push(piece.trim())
    rest = comma === -1 ? "" : rest.slice(comma + 2)
  }

  return { selected, custom, text: "" }
}

/** Rebuild form state from a submitted answer set, so the reader sees what was
 *  actually chosen rather than an empty form. */
export function valueFromAnswers(
  questions: SurveyQuestion[],
  answers: GenerateBriefAnswer[],
): QuestionnaireValue {
  const byId = new Map(answers.map((a) => [a.question_id, a.answer]))
  const out: Record<number, Answer> = {}
  const rejected: Record<number, boolean> = {}
  questions.forEach((q, i) => {
    const answer = byId.get(q.id)
    if (!answer) {
      // buildAnswersPayload omits rejected questions entirely, so a submitted
      // set with nothing for this question means it was skipped on purpose.
      // Without this it would read as merely unanswered, and the reason the
      // count stops short of the total would be invisible.
      rejected[i] = true
      return
    }
    const options = q.options ?? []
    // A free-text question has nothing to match against, so it stays as typed.
    out[i] = options.length
      ? splitAnswer(answer, options)
      : { selected: [], custom: [], text: answer }
  })
  return { answers: out, rejected }
}
