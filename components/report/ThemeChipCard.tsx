"use client"

import { useState } from "react"
import { Check, Loader2, Send, Sparkles, X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Editable theme card — inline-editable title + keyword chips (add on
 * Enter/comma/blur, Backspace removes the last chip) + remove-theme button.
 * Shared by the Strategic Brief review page (initial themes) and the plan page's
 * Suggested Themes editor — both are now `{ title, keywords[] }`.
 *
 * Purely presentational: all state lives in the parent via callbacks, so two
 * independent lists can reuse it without coupling.
 *
 * When `onToggleSelect` is provided the leading slot becomes a selection
 * checkbox (with a selection ring); otherwise it's the numbered index badge.
 */
export function ThemeChipCard({
  index,
  theme,
  isRtl,
  selected,
  readOnly,
  onToggleSelect,
  onTitleChange,
  onAddKeyword,
  onRemoveKeyword,
  onRemove,
  onRefine,
}: {
  index: number
  /** `summary` is AI-written and read-only here; absent/"" renders nothing. */
  theme: { title: string; keywords: string[]; summary?: string }
  isRtl?: boolean
  selected?: boolean
  /** Locked plan → static, non-interactive presentation. */
  readOnly?: boolean
  onToggleSelect?: () => void
  onTitleChange: (value: string) => void
  onAddKeyword: (keyword: string) => void
  onRemoveKeyword: (keywordIndex: number) => void
  onRemove: () => void
  /**
   * Optional per-theme "Refine with AI". When provided the card grows its own
   * instruction box; resolve true to clear the input (mirrors the page-level
   * refine panels). Omitted → no refine control at all.
   */
  onRefine?: (instruction: string) => Promise<boolean>
}) {
  const [draft, setDraft] = useState("")
  const [refineOpen, setRefineOpen] = useState(false)
  const [instruction, setInstruction] = useState("")
  const [refining, setRefining] = useState(false)
  const keywords = theme.keywords ?? []
  const canRefine = !!onRefine && !readOnly

  const submitRefine = async () => {
    const value = instruction.trim()
    if (!value || refining || !onRefine) return
    setRefining(true)
    try {
      if (await onRefine(value)) setInstruction("")
    } finally {
      setRefining(false)
    }
  }

  const commitDraft = () => {
    if (draft.trim()) onAddKeyword(draft)
    setDraft("")
  }

  const selectable = !!onToggleSelect

  return (
    <div
      className={cn(
        "relative rounded-xl border bg-indigo-50/40 p-4 transition-colors",
        readOnly ? "pr-4" : canRefine ? "pr-40" : "pr-9",
        selectable && selected
          ? "border-indigo-400 ring-1 ring-indigo-300"
          : "border-indigo-100",
      )}
    >
      {/* Per-theme refine + remove (hidden when read-only) */}
      {!readOnly && (
        <div className="absolute right-3 top-2.5 flex items-center gap-2">
          {canRefine && (
            <button
              type="button"
              onClick={() => setRefineOpen((o) => !o)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-100",
                refineOpen && "bg-indigo-100 ring-1 ring-indigo-300",
              )}
            >
              <Sparkles className="h-3.5 w-3.5" /> Refine with AI
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove theme"
            className="text-muted-foreground/40 transition-colors hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="flex items-start gap-3">
        {selectable ? (
          readOnly ? (
            // Static selection indicator — shows state, not interactive.
            <span
              role="checkbox"
              aria-checked={selected}
              aria-readonly="true"
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                selected
                  ? "border-indigo-500 bg-indigo-500 text-white"
                  : "border-slate-300 bg-white text-transparent",
              )}
            >
              <Check className="h-3.5 w-3.5" />
            </span>
          ) : (
            <button
              type="button"
              onClick={onToggleSelect}
              role="checkbox"
              aria-checked={selected}
              aria-label={selected ? "Deselect theme" : "Select theme"}
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors",
                selected
                  ? "border-indigo-500 bg-indigo-500 text-white"
                  : "border-slate-300 bg-white text-transparent hover:border-indigo-300",
              )}
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          )
        ) : (
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-xs font-semibold text-indigo-600">
            {index + 1}
          </span>
        )}
        <div className="min-w-0 flex-1">
          {readOnly ? (
            <h4
              dir={isRtl ? "rtl" : "ltr"}
              className={cn(
                "text-sm font-semibold text-foreground",
                isRtl && "text-right",
              )}
            >
              {theme.title || <span className="italic text-slate-400">Untitled theme</span>}
            </h4>
          ) : (
            /* Seamless inline-editable title */
            <input
              type="text"
              value={theme.title}
              onChange={(e) => onTitleChange(e.target.value)}
              dir={isRtl ? "rtl" : "ltr"}
              className={cn(
                "w-full border-0 bg-transparent p-0 text-sm font-semibold text-foreground outline-none",
                isRtl && "text-right",
              )}
            />
          )}
          {/* AI summary — what this theme's keywords reflect */}
          {theme.summary && (
            <p
              dir={isRtl ? "rtl" : "ltr"}
              className={cn(
                "mt-1.5 text-xs leading-relaxed text-muted-foreground",
                isRtl && "text-right",
              )}
            >
              {theme.summary}
            </p>
          )}
          {/* Keyword chips */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {keywords.map((kw, k) => (
              <span
                key={k}
                className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700"
              >
                {kw}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => onRemoveKeyword(k)}
                    className="text-indigo-400 transition-colors hover:text-indigo-700"
                    aria-label={`Remove ${kw}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
            {/* Add-keyword input — commits on Enter, comma, or blur */}
            {!readOnly && (
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault()
                    commitDraft()
                  } else if (e.key === "Backspace" && draft === "" && keywords.length > 0) {
                    onRemoveKeyword(keywords.length - 1)
                  }
                }}
                onBlur={commitDraft}
                placeholder="Add keyword…"
                dir={isRtl ? "rtl" : "ltr"}
                className="min-w-[8rem] flex-1 border-0 bg-transparent px-1 py-1 text-xs outline-none placeholder:text-muted-foreground/60"
              />
            )}
          </div>

          {/* Per-theme AI instruction box */}
          {canRefine && refineOpen && (
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    submitRefine()
                  }
                }}
                disabled={refining}
                placeholder="e.g. sharpen this theme, add ESG keywords, rename it…"
                dir={isRtl ? "rtl" : "ltr"}
                className="min-w-0 flex-1 rounded-full border border-indigo-200 bg-white px-3.5 py-2 text-xs outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-indigo-400 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={submitRefine}
                disabled={refining || !instruction.trim()}
                aria-label="Refine this theme"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:bg-indigo-300"
              >
                {refining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
