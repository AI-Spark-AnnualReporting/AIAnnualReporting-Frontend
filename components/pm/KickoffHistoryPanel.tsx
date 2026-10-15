"use client"

import { useState } from "react"
import {
  BellRing, CheckCircle2, History, Loader2, MessageSquareQuote, Paperclip, Pencil, Send, Sparkles, Undo2,
  UserRound, Wand2,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { useKickoffHistory } from "@/hooks/useShare"
import type { KickoffHistoryEntry, ShareStage } from "@/lib/api/share"
import { DiffPart, hasChanges, wordDiff } from "@/lib/textDiff"
import { cn } from "@/lib/utils"

/* ────────────────────────────────────────────────────────────────────────────
   The History button and panel for one kickoff gate. spark_internal only — the
   callers render it behind sparkFlow, and the endpoint refuses anyone else.

   Each entry says who did what and when, and for a change shows exactly what
   changed: removed words struck through in red, added words in green.
──────────────────────────────────────────────────────────────────────────── */

const STAGE_TITLE: Record<ShareStage, string> = {
  questionnaire: "Questionnaire",
  brief: "Strategic brief",
  areas: "Areas of focus",
}

/** Icon and sentence for each kind of entry. */
const ACTION: Record<KickoffHistoryEntry["action"], { icon: LucideIcon; verb: string; tone: string }> = {
  shared: { icon: Send, verb: "shared it", tone: "bg-indigo-100 text-indigo-700" },
  client_sent: { icon: UserRound, verb: "sent their response", tone: "bg-sky-100 text-sky-700" },
  sent_back: { icon: Undo2, verb: "sent it back", tone: "bg-amber-100 text-amber-700" },
  approved: { icon: CheckCircle2, verb: "approved it", tone: "bg-green-100 text-green-700" },
  reminded: { icon: BellRing, verb: "sent a reminder", tone: "bg-muted text-muted-foreground" },
  edited: { icon: Pencil, verb: "edited it", tone: "bg-violet-100 text-violet-700" },
  generated: { icon: Sparkles, verb: "AI wrote it", tone: "bg-fuchsia-100 text-fuchsia-700" },
  refined: { icon: Wand2, verb: "Refined with AI", tone: "bg-fuchsia-100 text-fuchsia-700" },
}

/** AI runs read as the AI's work, with the Spark user who started it named. */
function isAiRun(action: KickoffHistoryEntry["action"]): boolean {
  return action === "generated" || action === "refined"
}

/** "7 Oct, 14:20" */
function when(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

/** "14:20" — the end of a grouped edit, shown after its start. */
function timeOnly(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

/* ── Reading the loose before/after shapes ─────────────────────────────── */

type Loose = Record<string, unknown> | null | undefined

function text(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

/* ── Showing a change ──────────────────────────────────────────────────── */

/** Unchanged stretches longer than this many words are shortened to their
 *  ends, so a one-word edit in a long brief isn't buried in the whole text. */
const KEEP_WORDS = 10

/** Shorten a long unchanged stretch to its first and last few words. */
function shorten(part: string, isFirst: boolean, isLast: boolean): string {
  const words = part.split(/(\s+)/)
  const wordCount = words.filter((w) => w.trim()).length
  if (wordCount <= KEEP_WORDS * 2) return part
  const head = isFirst ? "" : words.slice(0, KEEP_WORDS * 2).join("")
  const tail = isLast ? "" : words.slice(-KEEP_WORDS * 2).join("")
  return `${head} … ${tail}`
}

/** A word diff, rendered inline. */
function DiffText({ parts }: { parts: DiffPart[] }) {
  return (
    <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
      {parts.map((part, i) => {
        if (part.type === "added") {
          return <ins key={i} className="rounded bg-green-100 px-0.5 text-green-900 no-underline">{part.text}</ins>
        }
        if (part.type === "removed") {
          return <del key={i} className="rounded bg-red-100 px-0.5 text-red-800">{part.text}</del>
        }
        return (
          <span key={i} className="text-muted-foreground">
            {shorten(part.text, i === 0, i === parts.length - 1)}
          </span>
        )
      })}
    </p>
  )
}

/** One labelled text comparison; nothing when it didn't change. */
/** True when the old and new text share no words at all: everything was
 *  replaced. Inline red-then-green reads as if the new text sat at the end,
 *  so this case is shown as two plain blocks instead. */
function replacedEntirely(parts: DiffPart[]): boolean {
  const kept = parts.some((p) => p.type === "same" && p.text.trim())
  const removed = parts.some((p) => p.type === "removed")
  const added = parts.some((p) => p.type === "added")
  return !kept && removed && added
}

/** Old and new text as two blocks, for a full replacement. */
function BeforeAfter({ before, after }: { before: string; after: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground">Replaced entirely</p>
      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-700">Before</p>
        <p className="whitespace-pre-line text-sm leading-relaxed text-red-900/80 line-through decoration-red-300">
          {before}
        </p>
      </div>
      <div className="rounded-lg border border-green-200 bg-green-50 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-700">After</p>
        <p className="whitespace-pre-line text-sm leading-relaxed text-green-900">{after}</p>
      </div>
    </div>
  )
}

function TextChange({ label, before, after }: { label?: string; before: string; after: string }) {
  if (before === after) return null
  const parts = wordDiff(before, after)
  if (!hasChanges(parts)) return null
  return (
    <div className="space-y-1">
      {label && <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>}
      {replacedEntirely(parts) ? (
        <BeforeAfter before={before} after={after} />
      ) : (
        <DiffText parts={parts} />
      )}
    </div>
  )
}

const ROLE_LABEL: Record<string, string> = { primary: "Lead", secondary: "Used", none: "Not used" }

function roleOf(area: Record<string, unknown> | undefined): string {
  return ROLE_LABEL[text(area?.role) || "none"] ?? "Not used"
}

/** The brief's text, compared. */
function BriefChange({ before, after }: { before: Loose; after: Loose }) {
  return <TextChange before={text(before?.strategic_brief)} after={text(after?.strategic_brief)} />
}

/** Each area compared by position: its name, summary, role and message. */
function AreasChange({ before, after }: { before: Loose; after: Loose }) {
  const oldAreas = list(before?.areas_of_focus)
  const newAreas = list(after?.areas_of_focus)
  const oldMessages = list(before?.concept_messages)
  const newMessages = list(after?.concept_messages)
  const count = Math.max(oldAreas.length, newAreas.length)

  const rows = []
  for (let i = 0; i < count; i++) {
    const oldArea = oldAreas[i]
    const newArea = newAreas[i]
    const name = text(newArea?.slogan) || text(oldArea?.slogan) || `Area ${i + 1}`

    if (!oldArea) {
      const message = newMessages[i]
      rows.push(
        <div key={i} className="space-y-2 rounded-lg border border-green-200 bg-green-50/50 p-3">
          <p className="text-sm">
            <span className="font-semibold text-green-700">+ Added:</span> {name}{" "}
            <span className="text-muted-foreground">({roleOf(newArea)})</span>
          </p>
          {text(newArea?.summary) && <p className="text-sm text-muted-foreground">{text(newArea?.summary)}</p>}
          {(text(message?.title) || text(message?.description)) && (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Concept message</p>
              {text(message?.title) && <p className="text-sm font-semibold text-foreground">{text(message?.title)}</p>}
              {text(message?.description) && (
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{text(message?.description)}</p>
              )}
            </div>
          )}
        </div>,
      )
      continue
    }
    if (!newArea) {
      rows.push(<p key={i} className="text-sm"><span className="font-semibold text-red-700">− Removed:</span> {name}</p>)
      continue
    }

    const oldMessage = oldMessages[i]
    const newMessage = newMessages[i]
    const changed =
      text(oldArea.slogan) !== text(newArea.slogan) ||
      text(oldArea.summary) !== text(newArea.summary) ||
      roleOf(oldArea) !== roleOf(newArea) ||
      text(oldMessage?.title) !== text(newMessage?.title) ||
      text(oldMessage?.description) !== text(newMessage?.description)
    if (!changed) continue

    rows.push(
      <div key={i} className="space-y-2 rounded-lg border border-border bg-background p-3">
        <p className="text-sm font-semibold text-foreground">{name}</p>
        {roleOf(oldArea) !== roleOf(newArea) && (
          <p className="text-sm text-muted-foreground">
            Role: {roleOf(oldArea)} → <span className="font-semibold text-foreground">{roleOf(newArea)}</span>
          </p>
        )}
        <TextChange label="Name" before={text(oldArea.slogan)} after={text(newArea.slogan)} />
        <TextChange label="Summary" before={text(oldArea.summary)} after={text(newArea.summary)} />
        <TextChange label="Message title" before={text(oldMessage?.title)} after={text(newMessage?.title)} />
        <TextChange label="Concept message" before={text(oldMessage?.description)} after={text(newMessage?.description)} />
      </div>,
    )
  }
  if (rows.length === 0) return null
  return (
    <div className="space-y-2">
      <AreasResult areas={newAreas} />
      {rows}
    </div>
  )
}

/** Every area by role after the change — the changed ones alone left the
 *  unchanged ones looking missing. */
function AreasResult({ areas }: { areas: Record<string, unknown>[] }) {
  const named = (role: string) =>
    areas.filter((a) => roleOf(a) === role).map((a) => text(a.slogan).trim() || "Untitled")
  const lines: { icon: string; label: string; names: string[] }[] = [
    { icon: "★", label: "Lead", names: named("Lead") },
    { icon: "✓", label: "Used", names: named("Used") },
    { icon: "○", label: "Not used", names: named("Not used") },
  ]
  return (
    <div className="rounded-lg bg-muted/50 p-3 text-sm">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Result</p>
      {lines
        .filter((line) => line.names.length > 0)
        .map((line) => (
          <p key={line.label} className="text-foreground">
            <span className="text-muted-foreground">{line.icon} {line.label}:</span> {line.names.join(", ")}
          </p>
        ))}
    </div>
  )
}

/** Questions added, removed, reworded or (un)rejected, and answers changed. */
function QuestionnaireChange({ before, after }: { before: Loose; after: Loose }) {
  const oldQuestions = list(before?.questions)
  const newQuestions = list(after?.questions)
  const oldById = new Map(oldQuestions.map((q) => [text(q.id), q]))
  const newById = new Map(newQuestions.map((q) => [text(q.id), q]))
  const oldAnswers = new Map(list(before?.answers).map((a) => [text(a.question_id), text(a.answer)]))
  const newAnswers = new Map(list(after?.answers).map((a) => [text(a.question_id), text(a.answer)]))

  const rows = []

  // The file the client attached, first: it shapes the brief as much as any
  // answer. Only shown when it changed (attached, replaced or gone).
  const oldFile = text(before?.document_name)
  const newFile = text(after?.document_name)
  if (oldFile !== newFile) {
    rows.push(
      <p key="file" className="flex items-start gap-1.5 text-sm">
        <Paperclip className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        {!oldFile ? (
          <span>
            <span className="font-semibold text-green-700">Attached:</span> {newFile}
          </span>
        ) : !newFile ? (
          <span>
            <span className="font-semibold text-red-700">File removed:</span> {oldFile}
          </span>
        ) : (
          <span>
            <span className="font-semibold">Replaced file:</span>{" "}
            <del className="text-red-700">{oldFile}</del> → <span className="text-green-700">{newFile}</span>
          </span>
        )}
      </p>,
    )
  }

  for (const q of newQuestions) {
    const id = text(q.id)
    const old = oldById.get(id)
    if (!old) {
      rows.push(<p key={`add-${id}`} className="text-sm"><span className="font-semibold text-green-700">+ Question added:</span> {text(q.text)}</p>)
    } else {
      if (text(old.text) !== text(q.text)) {
        rows.push(<TextChange key={`text-${id}`} label="Question reworded" before={text(old.text)} after={text(q.text)} />)
      }
      if (Boolean(old.rejected_by) !== Boolean(q.rejected_by)) {
        rows.push(
          <p key={`rej-${id}`} className="text-sm">
            <span className={cn("font-semibold", q.rejected_by ? "text-red-700" : "text-green-700")}>
              {q.rejected_by ? "Rejected:" : "Brought back:"}
            </span>{" "}
            {text(q.text)}
          </p>,
        )
      }
    }
    const oldAnswer = oldAnswers.get(id) ?? ""
    const newAnswer = newAnswers.get(id) ?? ""
    if (oldAnswer !== newAnswer) {
      rows.push(
        <div key={`ans-${id}`} className="space-y-1 rounded-lg border border-border bg-background p-3">
          <p className="text-sm font-medium text-foreground">{text(q.text)}</p>
          {newAnswer ? (
            <TextChange before={oldAnswer} after={newAnswer} />
          ) : (
            <p className="text-sm italic text-muted-foreground">No answer</p>
          )}
        </div>,
      )
    }
  }
  for (const q of oldQuestions) {
    if (!newById.has(text(q.id))) {
      rows.push(<p key={`rm-${text(q.id)}`} className="text-sm"><span className="font-semibold text-red-700">− Question removed:</span> {text(q.text)}</p>)
    }
  }
  if (rows.length === 0) return null
  return <div className="space-y-2">{rows}</div>
}

/** The change an entry made, for its stage. Nothing for pure events. */
function EntryChange({ entry, stage }: { entry: KickoffHistoryEntry; stage: ShareStage }) {
  // "shared" carries what was sent, not a change; the rest of the timeline
  // compares against it.
  const changes = ["edited", "client_sent", "generated", "refined"]
  if (!changes.includes(entry.action)) return null
  if (stage === "brief") return <BriefChange before={entry.before} after={entry.after} />
  if (stage === "areas") return <AreasChange before={entry.before} after={entry.after} />
  return <QuestionnaireChange before={entry.before} after={entry.after} />
}

/** One row of the timeline. */
function Entry({ entry, stage }: { entry: KickoffHistoryEntry; stage: ShareStage }) {
  const action = ACTION[entry.action] ?? ACTION.edited
  const Icon = action.icon
  const who =
    entry.actor_label || (entry.actor_type === "client" ? "The client" : "Spark")
  const grouped = entry.action === "edited" && entry.updated_at !== entry.at
  const change = <EntryChange entry={entry} stage={stage} />

  return (
    <li className="relative flex gap-3 pb-6 last:pb-0">
      <span className={cn("z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", action.tone)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-2 pt-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          {isAiRun(entry.action) ? (
            <p className="text-sm text-foreground">
              <span className="font-semibold">{action.verb}</span>{" "}
              <span className="text-muted-foreground">(run by {who})</span>
            </p>
          ) : (
            <p className="text-sm text-foreground">
              <span className="font-semibold">{who}</span>{" "}
              <span className="text-muted-foreground">
                {entry.actor_type === "client" ? "(client)" : "(Spark)"}
              </span>{" "}
              {action.verb}
              {entry.action === "shared" && entry.note ? ` with ${entry.note}` : ""}
            </p>
          )}
          <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {when(entry.at)}
            {grouped && ` – ${timeOnly(entry.updated_at)}`}
          </p>
        </div>
        {entry.note && entry.action !== "shared" && (
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-2.5 text-sm">
            <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="min-w-0 whitespace-pre-line text-foreground">
              {entry.action === "refined" && <span className="font-semibold">Instruction: </span>}
              {entry.note}
            </p>
          </div>
        )}
        {change}
      </div>
    </li>
  )
}

/** The History button, and the panel it opens, for one gate. */
export function KickoffHistoryButton({ cycleId, stage }: { cycleId: string; stage: ShareStage }) {
  const [open, setOpen] = useState(false)
  const { data: entries, isLoading, isError } = useKickoffHistory(cycleId, stage, open)

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="shrink-0">
        <History className="h-4 w-4" /> History
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] flex-col sm:max-w-3xl">
          <DialogTitle>{STAGE_TITLE[stage]}: history</DialogTitle>
          <DialogDescription>
            What the client and Spark changed, and when. Newest first. Edits made within ten
            minutes of each other show as one.
          </DialogDescription>

          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            {isLoading ? (
              <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
              </div>
            ) : isError ? (
              <p className="py-10 text-sm text-destructive">Couldn&apos;t load the history. Try again.</p>
            ) : !entries || entries.length === 0 ? (
              <p className="py-10 text-sm text-muted-foreground">
                Nothing yet. Changes appear here as they happen.
              </p>
            ) : (
              <ol className="relative pt-2 before:absolute before:bottom-2 before:left-4 before:top-4 before:w-px before:bg-border">
                {entries.map((entry) => (
                  <Entry key={entry.id} entry={entry} stage={stage} />
                ))}
              </ol>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
