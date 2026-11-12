"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { SurveyQuestion } from "@/lib/api/pm"
import {
  Answer,
  QuestionnaireValue,
  answerAfterOptionsChange,
  cleanChoices,
  emptyAnswer,
  isAnswered,
} from "@/lib/questionnaireAnswers"

// The pure answer logic lives in lib/questionnaireAnswers so its round-trip can
// be tested without a DOM. Re-exported here so callers have one import.
export {
  answerAfterOptionsChange,
  cleanChoices,
  emptyAnswer,
  emptyQuestionnaireValue,
  isAnswered,
  answeredCount,
  requiredCount,
  isComplete,
  buildAnswersPayload,
  splitAnswer,
  valueFromAnswers,
} from "@/lib/questionnaireAnswers"
export type { Answer, QuestionnaireValue } from "@/lib/questionnaireAnswers"
import { cn } from "@/lib/utils"
import { Ban, Check, Loader2, Pencil, RotateCcw, Trash2, X } from "lucide-react"

/* ────────────────────────────────────────────────────────────────────────────
   The strategic questionnaire, rendered once and used twice: by the PM on
   /pm/cycles/[id]/kickoff, and by the client on the public /share/[token] page.

   Extracted rather than copied because the rules below are subtle enough that
   two copies WOULD drift — and the client's copy drifting means the answers
   that reach the brief are shaped differently depending on who typed them.

   - `options: string[]` → chip-select. Render ALL of them; the API never
     appends an "Other" entry, so slicing the array drops a real answer. The
     "Other…" box is ours, drawn alongside. Options that read as full sentences
     switch that row to stacked full-width checkbox rows (see isLongForm) —
     the layout follows the CONTENT, never the question id.
   - `options: null` → plain free-text box, no chips.
   - Order is stable per cycle, so questions are safely indexed by position.

   State lives in the parent so the PM's page can prefill it from the client's
   submitted answers; this component only renders and reports changes.
──────────────────────────────────────────────────────────────────────────── */

/** Sentence-length options shred an inline pill row once they wrap, so they get
 *  stacked full-width checkbox rows instead. Driven off the option text, so any
 *  question — template or generated — picks the layout that fits its content. */
const isLongForm = (q: SurveyQuestion) => (q.options ?? []).some((o) => o.length > 40)

/** Every string in `options` is a real answer — the API never appends an "Other"
 *  entry (the generator prompt explicitly forbids it). The "Other…" box below the
 *  options is ours, a UI affordance, so nothing here may be sliced off. */
const hasOptions = (q: SurveyQuestion) => !!q.options && q.options.length > 0

const REJECTED_BY_LABEL: Record<string, string> = {
  spark: "Spark",
  pm: "the PM",
  client: "the client",
}

function formatRejectedAt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

/** One question being edited: its position, and the draft wording/choices.
 *  Nothing is saved until Save, so Cancel simply drops the draft. */
interface QuestionDraft {
  index: number
  text: string
  options: string[]
  newOption: string
}

export function QuestionnaireForm({
  questions,
  value,
  onChange,
  readOnly = false,
  editableQuestionIds,
  onRemoveQuestion,
  onEditQuestion,
  onToggleRejected,
  deletingQuestionId,
  undoableQuestionIds,
  onUndoEdit,
  showEditedBy = true,
}: {
  questions: SurveyQuestion[]
  value: QuestionnaireValue
  onChange: (next: QuestionnaireValue) => void
  readOnly?: boolean
  /** Which questions THIS reader may DELETE, by id.
   *
   *  Not derived from `source` any more. Both Spark and the client write their
   *  own questions and both are stored as "manual", so keying off that let the
   *  client delete Spark's — and since answers are keyed by position, deleting
   *  one shifted every answer after it onto the wrong question. Only the caller
   *  knows which of these questions are the reader's own. */
  editableQuestionIds?: string[]
  onRemoveQuestion?: (questionId: string) => void
  /** Change one question's wording and choices. ANY question may be edited
   *  (not only the reader's own), while the form isn't read-only and the
   *  question isn't rejected. Called once, on Save. Omit to hide Edit. */
  onEditQuestion?: (
    questionId: string,
    text: string,
    options: string[] | null,
  ) => void | Promise<void>
  /** Questions the reader changed this round and can still take back (the
   *  client's page, before they send). Shows "Undo my change". */
  undoableQuestionIds?: string[]
  onUndoEdit?: (questionId: string) => void
  /** Show "Edited by …" under a question. Off on the client's page — who at
   *  Spark changed a question is not theirs to read. */
  showEditedBy?: boolean
  /** Persist a rejection as it happens. The form still flips it on screen at
   *  once; this records it, so it survives a refresh and says who made it.
   *  Omitted on the client's page, which sends its rejections with the reply. */
  onToggleRejected?: (questionId: string, rejected: boolean) => void
  /** The question whose delete is saving: its card fades and stops taking
   *  clicks, and its Delete button shows a spinner until the list reloads. */
  deletingQuestionId?: string | null
}) {
  const { answers, rejected } = value
  const mine = new Set(editableQuestionIds ?? [])
  const undoable = new Set(undoableQuestionIds ?? [])
  // One question edited at a time.
  const [draft, setDraft] = useState<QuestionDraft | null>(null)
  const [savingDraft, setSavingDraft] = useState(false)

  const startEdit = (index: number) => {
    const q = questions[index]
    if (!q) return
    setDraft({ index, text: q.text, options: [...(q.options ?? [])], newOption: "" })
  }

  /** Add the "+ Add choice" box's text as a choice, then clear the box. */
  const addDraftOption = () => {
    if (!draft) return
    const text = draft.newOption.trim()
    if (!text) return
    setDraft({ ...draft, options: [...draft.options, text], newOption: "" })
  }

  /** Save the draft: keep the answer valid for the new choices, then hand the
   *  change to the page (which saves it, or keeps it until the client sends). */
  const saveDraft = async () => {
    if (!draft || !onEditQuestion) return
    const q = questions[draft.index]
    const text = draft.text.trim()
    if (!q || !text) return
    const pending = draft.newOption.trim()
    const options = cleanChoices(pending ? [...draft.options, pending] : draft.options)

    const current = answers[draft.index]
    if (current) {
      onChange({
        ...value,
        answers: { ...answers, [draft.index]: answerAfterOptionsChange(current, options) },
      })
    }
    setSavingDraft(true)
    try {
      await onEditQuestion(q.id, text, options)
      setDraft(null)
    } finally {
      setSavingDraft(false)
    }
  }
  const patch = (answersNext: Record<number, Answer>) =>
    onChange({ ...value, answers: answersNext })

  // Multi-select — toggles one chip on/off without touching any others or the
  // free-text field.
  const toggleChip = (index: number, option: string) => {
    const current = answers[index] ?? emptyAnswer
    const selected = current.selected.includes(option)
      ? current.selected.filter((v) => v !== option)
      : [...current.selected, option]
    patch({ ...answers, [index]: { ...current, selected } })
  }

  // Free text is fully independent of chip selection — used for plain
  // free-text questions AND as the "Other…" draft box.
  const setText = (index: number, text: string) =>
    patch({ ...answers, [index]: { ...(answers[index] ?? emptyAnswer), text } })

  // Commit the "Other…" draft as its own pill (Enter or blur). Duplicates of an
  // existing pill or preset chip are dropped rather than added twice.
  const commitCustom = (index: number, presets: string[]) => {
    const current = answers[index] ?? emptyAnswer
    const v = current.text.trim()
    if (!v) return
    const dupe =
      current.custom.includes(v) || presets.includes(v) || current.selected.includes(v)
    patch({
      ...answers,
      [index]: { ...current, custom: dupe ? current.custom : [...current.custom, v], text: "" },
    })
  }

  // By position, not by value — editing can make two pills identical, and
  // filtering on value would take both out.
  const removeCustom = (index: number, customIdx: number) => {
    const current = answers[index] ?? emptyAnswer
    patch({
      ...answers,
      [index]: { ...current, custom: current.custom.filter((_, k) => k !== customIdx) },
    })
  }

  // A committed pill stays editable — click into it and retype.
  const editCustom = (index: number, customIdx: number, next: string) => {
    const current = answers[index] ?? emptyAnswer
    patch({
      ...answers,
      [index]: {
        ...current,
        custom: current.custom.map((v, k) => (k === customIdx ? next : v)),
      },
    })
  }

  // Leaving a pill empty deletes it; otherwise trim what was typed.
  const commitCustomEdit = (index: number, customIdx: number) => {
    const current = answers[index] ?? emptyAnswer
    const v = (current.custom[customIdx] ?? "").trim()
    patch({
      ...answers,
      [index]: {
        ...current,
        custom: v
          ? current.custom.map((x, k) => (k === customIdx ? v : x))
          : current.custom.filter((_, k) => k !== customIdx),
      },
    })
  }

  const toggleRejected = (index: number) => {
    const next = !rejected[index]
    onChange({ ...value, rejected: { ...rejected, [index]: next } })
    const q = questions[index]
    if (q) onToggleRejected?.(q.id, next)
  }

  return (
    <div className="space-y-4">
      {questions.map((q, i) => {
        const a = answers[i] ?? emptyAnswer
        const isRejected = !!rejected[i]
        const answered = !isRejected && isAnswered(a)
        const presets = q.options ?? []
        const longForm = isLongForm(q)
        const isEditing = draft?.index === i
        const canEdit = !!onEditQuestion && !readOnly && !isRejected

        return (
          <div
            key={i}
            aria-busy={deletingQuestionId === q.id}
            className={cn(
              "rounded-2xl border bg-card p-5 shadow-sm transition-colors",
              deletingQuestionId === q.id && "pointer-events-none opacity-50",
              isRejected
                ? "border-dashed border-border bg-muted/30"
                : answered
                  ? "border-indigo-200"
                  : "border-border",
            )}
          >
            {/* Question header */}
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  answered ? "bg-indigo-100 text-indigo-700" : "bg-muted text-muted-foreground",
                )}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                {isEditing && draft ? (
                  // Saved on Save, not on blur: wording and choices go
                  // together, and Cancel has to be able to drop both.
                  <input
                    type="text"
                    value={draft.text}
                    autoFocus
                    aria-label={`Edit question ${i + 1}`}
                    onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        saveDraft()
                      } else if (e.key === "Escape") {
                        setDraft(null)
                      }
                    }}
                    className="w-full rounded-md border border-indigo-400 bg-background px-1.5 py-0.5 font-semibold leading-snug text-foreground outline-none transition-colors"
                  />
                ) : (
                  <p
                    className={cn(
                      "font-semibold leading-snug",
                      isRejected ? "text-muted-foreground line-through" : "text-foreground",
                    )}
                  >
                    {q.text}
                  </p>
                )}
                {isRejected && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {/* Who decided, once it's saved. Until then — the moment
                        between the click and the save — the plain line. */}
                    {q.rejected_by
                      ? `Rejected by ${REJECTED_BY_LABEL[q.rejected_by] ?? q.rejected_by}${
                          q.rejected_at ? ` on ${formatRejectedAt(q.rejected_at)}` : ""
                        } — this question won't be used in the brief.`
                      : "Skipped — this question won't be used in the brief."}
                  </p>
                )}
                {!isRejected && !isEditing && undoable.has(q.id) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    You changed this question.{" "}
                    {onUndoEdit && !readOnly && (
                      <button
                        type="button"
                        onClick={() => onUndoEdit(q.id)}
                        className="font-semibold text-indigo-700 hover:underline"
                      >
                        Undo my change
                      </button>
                    )}
                  </p>
                )}
                {!isRejected && !isEditing && !undoable.has(q.id) && showEditedBy && q.edited_by && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {`Edited by ${REJECTED_BY_LABEL[q.edited_by] ?? q.edited_by}${
                      q.edited_at ? ` on ${formatRejectedAt(q.edited_at)}` : ""
                    }`}
                  </p>
                )}

              </div>
              {answered && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                  <Check className="h-3 w-3" /> Answered
                </span>
              )}
              {canEdit && !isEditing && (
                <button
                  type="button"
                  onClick={() => startEdit(i)}
                  disabled={!!draft}
                  title="Change this question's wording or choices"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
              )}
              {!readOnly && onRemoveQuestion && mine.has(q.id) && !isEditing && (
                <button
                  type="button"
                  onClick={() => onRemoveQuestion(q.id)}
                  disabled={deletingQuestionId === q.id}
                  title="Delete this question"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                >
                  {deletingQuestionId === q.id ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" /> Deleting…
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3 w-3" /> Delete
                    </>
                  )}
                </button>
              )}
              {!readOnly && !isEditing && (
                <button
                  type="button"
                  onClick={() => toggleRejected(i)}
                  title={isRejected ? "Include this question again" : "Reject this question"}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                >
                  {isRejected ? (
                    <>
                      <RotateCcw className="h-3 w-3" /> Undo
                    </>
                  ) : (
                    <>
                      <Ban className="h-3 w-3" /> Reject
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Chip-select (with inline "Other…" box) or plain free-text.
                Hidden entirely once rejected — nothing left to answer. */}
            {isEditing && draft ? (
              <div className="mt-4 space-y-3 pl-9">
                <p className="text-xs font-semibold text-muted-foreground">
                  Choices — leave none for a written answer
                </p>
                <div className="flex flex-wrap gap-2">
                  {/* Keyed by position: keying by value would remount the
                      input on every keystroke and drop focus. */}
                  {draft.options.map((opt, optIdx) => (
                    <span
                      key={optIdx}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground"
                    >
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            options: draft.options.map((o, k) => (k === optIdx ? e.target.value : o)),
                          })
                        }
                        size={Math.max(opt.length, 3)}
                        aria-label={`Edit choice "${opt}"`}
                        className="max-w-full border-0 bg-transparent p-0 text-sm font-medium text-foreground outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            options: draft.options.filter((_, k) => k !== optIdx),
                          })
                        }
                        title={`Remove "${opt}"`}
                        className="text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={draft.newOption}
                    onChange={(e) => setDraft({ ...draft, newOption: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        addDraftOption()
                      }
                    }}
                    onBlur={addDraftOption}
                    placeholder="+ Add choice"
                    aria-label="Add a choice"
                    className="min-w-[7rem] max-w-full rounded-full border border-dashed border-muted-foreground/40 bg-background px-3.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-indigo-400"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setDraft(null)}
                    disabled={savingDraft}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={saveDraft}
                    disabled={savingDraft || !draft.text.trim()}
                  >
                    {savingDraft && <Loader2 className="animate-spin" />}
                    Save
                  </Button>
                </div>
              </div>
            ) : isRejected ? null : hasOptions(q) ? (
              <div
                className={cn(
                  "mt-4 flex gap-2 pl-9",
                  longForm ? "flex-col items-stretch" : "flex-wrap",
                )}
              >
                {presets.map((opt, optIdx) => {
                  const selected = a.selected.includes(opt)
                  return (
                    <button
                      key={optIdx}
                      type="button"
                      aria-pressed={selected}
                      disabled={readOnly}
                      onClick={() => toggleChip(i, opt)}
                      className={cn(
                        "border text-sm font-medium transition-colors",
                        longForm
                          ? "flex w-full items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-left"
                          : "rounded-full px-3.5 py-2",
                        selected
                          ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                          : "border-border bg-background text-foreground hover:border-indigo-300 hover:bg-accent",
                        readOnly && "cursor-default opacity-90 hover:border-border hover:bg-background",
                      )}
                    >
                      {longForm && (
                        <span
                          aria-hidden
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            selected
                              ? "border-indigo-500 bg-indigo-600 text-white"
                              : "border-muted-foreground/40 bg-background",
                          )}
                        >
                          {selected && <Check className="h-3 w-3" />}
                        </span>
                      )}
                      {opt}
                    </button>
                  )
                })}

                {/* Written-in answers — as many as they like, each its own pill,
                    each still editable after committing. Keyed by position:
                    keying by value would remount the input on every keystroke
                    and drop focus. */}
                {a.custom.map((v, customIdx) => (
                  <span
                    key={customIdx}
                    className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400 bg-indigo-50 px-3.5 py-2 text-sm font-medium text-indigo-700"
                  >
                    <input
                      type="text"
                      value={v}
                      readOnly={readOnly}
                      onChange={(e) => editCustom(i, customIdx, e.target.value)}
                      onBlur={() => !readOnly && commitCustomEdit(i, customIdx)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          e.currentTarget.blur()
                        }
                      }}
                      size={Math.max(v.length, 3)}
                      aria-label={`Edit answer "${v}"`}
                      className="border-0 bg-transparent p-0 text-sm font-medium text-indigo-700 outline-none"
                    />
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => removeCustom(i, customIdx)}
                        title={`Remove "${v}"`}
                        className="text-indigo-400 transition-colors hover:text-indigo-700"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                ))}

                {/* Read-only hides the "Other…" box below, so a draft still
                    sitting in `text` would disappear with it. Show it. */}
                {readOnly && a.text.trim() && (
                  <span className="inline-flex items-center rounded-full border border-indigo-400 bg-indigo-50 px-3.5 py-2 text-sm font-medium text-indigo-700">
                    {a.text.trim()}
                  </span>
                )}

                {/* Independent of chip selection — Enter (or blur) turns the
                    draft into a pill so the next one can be typed. */}
                {!readOnly && (
                  <input
                    type="text"
                    value={a.text}
                    onChange={(e) => setText(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault()
                        commitCustom(i, presets)
                      } else if (e.key === "Backspace" && !a.text && a.custom.length > 0) {
                        removeCustom(i, a.custom.length - 1)
                      }
                    }}
                    onBlur={() => commitCustom(i, presets)}
                    placeholder={a.custom.length > 0 ? "Add another…" : "Other…"}
                    className={cn(
                      "min-w-[7rem] max-w-full rounded-full border px-3.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/70",
                      a.text.trim()
                        ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                        : "border-dashed border-muted-foreground/40 bg-background focus:border-indigo-400",
                    )}
                  />
                )}
              </div>
            ) : (
              <div className="mt-4 pl-9">
                <Textarea
                  value={a.text}
                  readOnly={readOnly}
                  onChange={(e) => setText(i, e.target.value)}
                  placeholder={readOnly ? "" : "Type your answer…"}
                  rows={2}
                  className="text-sm"
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
