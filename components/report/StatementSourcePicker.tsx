"use client"

import { FileUp, Loader2, PenLine, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// The two human-voice statements that open on a choice of source instead of a
// blank editor. Both are ai_allowed=false / content_source="narrative" in the
// catalogue, so both render through ManualSection. Every other manual section
// keeps the silent previous-cycle pre-fill and the plain editor.
const ASSISTED_STATEMENT_CODES = new Set(["chairman_statement", "ceo_review"])

export function isAssistedStatement(sectionCode: string): boolean {
  return ASSISTED_STATEMENT_CODES.has(sectionCode)
}

// The three ways one of these statements can get its content.
export type StatementSource = "draft" | "write" | "upload"

/**
 * The opening choice for the Chairman's Statement and the CEO's Review.
 *
 * Three cards, one press each. Nothing here fires a request on its own — the
 * draft card's press is the only thing that reaches the LLM, and it does so
 * because the PM asked.
 *
 * `hasExisting` is true when the section already holds text or a document, i.e.
 * the PM reached these choices from the editor rather than from an empty
 * section. The picker then says so, and offers a way back that keeps what's
 * there; the confirm for the destructive picks belongs to the caller, which
 * knows which of the two sources is at stake.
 */
export function StatementSourcePicker({
  hasExisting = false,
  drafting = false,
  busy = false,
  onChoose,
  onKeep,
}: {
  hasExisting?: boolean
  drafting?: boolean
  busy?: boolean
  onChoose: (source: StatementSource) => void
  onKeep?: () => void
}) {
  const disabled = drafting || busy

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-500">
          {hasExisting
            ? "This section already has content. Whichever source you pick below replaces it."
            : "Choose how this section gets written. You can change this later."}
        </p>
        {hasExisting && onKeep && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onKeep}
            className="shrink-0 text-slate-600 hover:bg-slate-100"
          >
            Keep what&apos;s there
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <SourceCard
          icon={Sparkles}
          tone="indigo"
          title="Use our suggestion"
          body="We write the whole statement from this cycle's material. It arrives as a draft for you to check and edit — it is saved only when you save it."
          action="Write a draft"
          pendingAction="Writing the draft…"
          pending={drafting}
          disabled={disabled}
          onClick={() => onChoose("draft")}
        />
        <SourceCard
          icon={PenLine}
          tone="slate"
          title="Write it myself"
          body="Open an empty editor and write the statement yourself."
          action="Open the editor"
          disabled={disabled}
          onClick={() => onChoose("write")}
        />
        <SourceCard
          icon={FileUp}
          tone="slate"
          title="Upload a document"
          body="Use a statement you already have. The file goes into the report as it is, in place of any text here."
          action="Choose a file"
          disabled={disabled}
          onClick={() => onChoose("upload")}
        />
      </div>
    </div>
  )
}

function SourceCard({
  icon: Icon,
  tone,
  title,
  body,
  action,
  pendingAction,
  pending = false,
  disabled = false,
  onClick,
}: {
  icon: typeof Sparkles
  tone: "indigo" | "slate"
  title: string
  body: string
  action: string
  pendingAction?: string
  pending?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <article
      className={cn(
        "rounded-xl border bg-white p-4 transition-colors",
        tone === "indigo"
          ? "border-indigo-200 hover:border-indigo-300"
          : "border-slate-200 hover:border-slate-300",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            tone === "indigo" ? "bg-indigo-50" : "bg-slate-100",
          )}
        >
          <Icon
            className={cn(
              "h-4 w-4",
              tone === "indigo" ? "text-indigo-600" : "text-slate-500",
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{body}</p>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          variant={tone === "indigo" ? "default" : "outline"}
          onClick={onClick}
          disabled={disabled}
          className={cn(
            tone === "indigo"
              ? "bg-indigo-600 text-white hover:bg-indigo-700"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
          )}
        >
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {pendingAction ?? action}
            </>
          ) : (
            action
          )}
        </Button>
      </div>
    </article>
  )
}
