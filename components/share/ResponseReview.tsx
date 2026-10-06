"use client"

import { Ban, Check, Circle, FileText, MessageSquareQuote, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { ProsePreview } from "@/components/ui/prose-preview"
import type { Answer, QuestionnaireValue } from "@/lib/questionnaireAnswers"
import type { AreaOfFocus } from "@/lib/areasOfFocus"
import type { ConceptMessage, SurveyQuestion } from "@/lib/api/pm"

/* ────────────────────────────────────────────────────────────────────────────
   What the client is about to send, read-only, shown in the review window
   before the link locks. One component per link: the questionnaire, the
   strategic brief, and the areas of focus.
──────────────────────────────────────────────────────────────────────────── */

/** One answer as a line of text: picked options, their own options, then
 *  anything typed. */
function answerText(answer: Answer | undefined): string {
  if (!answer) return ""
  const parts = [...answer.selected, ...answer.custom, answer.text.trim()]
  return parts.filter(Boolean).join(", ")
}

/** "6 answered · 1 rejected" — the counts above each review. */
function SummaryLine({ items }: { items: string[] }) {
  return (
    <p className="text-sm font-medium text-muted-foreground">{items.join(" · ")}</p>
  )
}

/** Their note, if they wrote one. */
function NoteLine({ note }: { note: string }) {
  if (!note.trim()) return null
  return (
    <div className="flex items-start gap-2 rounded-xl bg-muted/50 p-3 text-sm">
      <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 whitespace-pre-line text-foreground">
        <span className="font-semibold">Your note: </span>
        {note.trim()}
      </p>
    </div>
  )
}

/** The scrolling box the long part of each review sits in. */
function ScrollBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-border bg-card">
      {children}
    </div>
  )
}

export function QuestionnaireReview({
  questions,
  value,
  ownQuestionIds,
  documentName,
}: {
  questions: SurveyQuestion[]
  value: QuestionnaireValue
  /** Questions the client wrote themselves, labelled as theirs. */
  ownQuestionIds: string[]
  documentName: string | null
}) {
  const own = new Set(ownQuestionIds)
  let answered = 0
  let rejected = 0
  questions.forEach((_, i) => {
    if (value.rejected[i]) rejected += 1
    else if (answerText(value.answers[i])) answered += 1
  })

  const summary = [`${answered} answered`]
  if (rejected > 0) summary.push(`${rejected} rejected`)
  if (own.size > 0) summary.push(`${own.size} question${own.size === 1 ? "" : "s"} you added`)

  return (
    <div className="space-y-3">
      <SummaryLine items={summary} />
      {documentName && (
        <p className="flex items-center gap-2 text-sm text-foreground">
          <FileText className="h-4 w-4 shrink-0 text-indigo-600" />
          <span className="truncate">{documentName}</span>
        </p>
      )}
      <ScrollBox>
        <ol className="divide-y divide-border">
          {questions.map((q, i) => {
            const isRejected = Boolean(value.rejected[i])
            const text = answerText(value.answers[i])
            return (
              <li key={`${q.id}-${i}`} className="flex gap-3 px-4 py-3">
                <span className="w-5 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {q.text}
                    {own.has(q.id) && (
                      <span className="ml-1.5 text-xs font-normal text-indigo-600">(your question)</span>
                    )}
                  </p>
                  {isRejected ? (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Ban className="h-3 w-3" /> Rejected
                    </p>
                  ) : (
                    <p className={cn("mt-0.5 text-sm", text ? "text-muted-foreground" : "italic text-muted-foreground/70")}>
                      {text || "No answer"}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </ScrollBox>
    </div>
  )
}

export function BriefReview({
  brief,
  originalBrief,
  note,
}: {
  brief: string
  /** What Spark sent, so we can say whether they changed it. */
  originalBrief: string
  note: string
}) {
  const words = brief.trim() ? brief.trim().split(/\s+/).length : 0
  const summary = [`About ${words} words`]
  if (brief.trim() !== originalBrief.trim()) summary.push("edited by you")

  return (
    <div className="space-y-3">
      <SummaryLine items={summary} />
      <ScrollBox>
        <p className="whitespace-pre-line p-4 text-sm leading-relaxed text-foreground">{brief}</p>
      </ScrollBox>
      <NoteLine note={note} />
    </div>
  )
}

/** How each role reads in the review, with its icon. */
const ROLE_LABEL: Record<AreaOfFocus["role"], string> = {
  primary: "Lead",
  secondary: "Used",
  none: "Not used",
}

export function AreasReview({
  areas,
  concepts,
  note,
}: {
  areas: AreaOfFocus[]
  /** Linked to the areas by position. */
  concepts: ConceptMessage[]
  note: string
}) {
  const used = areas.filter((a) => (a.role ?? "none") !== "none").length
  const leading = areas.filter((a) => a.role === "primary").length

  return (
    <div className="space-y-3">
      <SummaryLine items={[`${areas.length} areas`, `${used} used`, `${leading} leading`]} />
      <ScrollBox>
        <ul className="divide-y divide-border">
          {areas.map((area, i) => {
            const role = area.role ?? "none"
            const message = concepts[i]
            const title = message?.title?.trim()
            const body = message?.description?.trim()
            return (
              <li key={i} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 shrink-0">
                  {role === "primary" ? (
                    <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
                  ) : role === "secondary" ? (
                    <Check className="h-4 w-4 text-green-600" strokeWidth={3} />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground/50" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", role === "none" ? "text-muted-foreground" : "text-foreground")}>
                    {area.slogan || "Untitled area"}
                  </p>
                  {/* The whole message, rendered the way its card on the page
                      renders it (sanitised — the client may have rewritten it). */}
                  {title || body ? (
                    <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3">
                      {title && <p className="text-sm font-semibold text-foreground">{title}</p>}
                      {body && (
                        <div className={cn("text-sm", title && "mt-1.5")}>
                          <ProsePreview content={body} className="prose-indigo" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-0.5 text-xs italic text-muted-foreground/70">No concept message</p>
                  )}
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                    role === "primary" && "bg-amber-100 text-amber-800",
                    role === "secondary" && "bg-green-100 text-green-800",
                    role === "none" && "bg-muted text-muted-foreground",
                  )}
                >
                  {ROLE_LABEL[role]}
                </span>
              </li>
            )
          })}
        </ul>
      </ScrollBox>
      <NoteLine note={note} />
    </div>
  )
}
