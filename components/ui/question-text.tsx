import { splitQuestion } from "@/lib/questionText"

/** Topic prefix of a generated question, shown as a tag. */
export function QuestionTag({ topic }: { topic: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
      {topic}
    </span>
  )
}

/**
 * Tag + question text — drops into an existing `<p>`/`<span>`, so the
 * surrounding type styles stay with the call site. `stacked` puts the tag on
 * its own line, for lists where the questions are long enough that an inline
 * tag gets lost.
 */
export function QuestionText({ text, stacked }: { text: string; stacked?: boolean }) {
  const { topic, question } = splitQuestion(text)
  if (!topic) return <>{question}</>
  return stacked ? (
    <>
      <span className="mb-1 block">
        <QuestionTag topic={topic} />
      </span>
      {question}
    </>
  ) : (
    <>
      <QuestionTag topic={topic} /> {question}
    </>
  )
}
