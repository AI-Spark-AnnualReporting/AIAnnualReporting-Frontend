"use client"

import { useState } from "react"
import { Check, X } from "lucide-react"
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
  onToggleSelect,
  onTitleChange,
  onAddKeyword,
  onRemoveKeyword,
  onRemove,
}: {
  index: number
  theme: { title: string; keywords: string[] }
  isRtl?: boolean
  selected?: boolean
  onToggleSelect?: () => void
  onTitleChange: (value: string) => void
  onAddKeyword: (keyword: string) => void
  onRemoveKeyword: (keywordIndex: number) => void
  onRemove: () => void
}) {
  const [draft, setDraft] = useState("")
  const keywords = theme.keywords ?? []

  const commitDraft = () => {
    if (draft.trim()) onAddKeyword(draft)
    setDraft("")
  }

  const selectable = !!onToggleSelect

  return (
    <div
      className={cn(
        "relative rounded-xl border bg-indigo-50/40 p-4 pr-9 transition-colors",
        selectable && selected
          ? "border-indigo-400 ring-1 ring-indigo-300"
          : "border-indigo-100",
      )}
    >
      {/* Remove theme */}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove theme"
        className="absolute right-3 top-3 text-muted-foreground/40 transition-colors hover:text-destructive"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        {selectable ? (
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
        ) : (
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-xs font-semibold text-indigo-600">
            {index + 1}
          </span>
        )}
        <div className="min-w-0 flex-1">
          {/* Seamless inline-editable title */}
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
          {/* Editable keyword chips */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {keywords.map((kw, k) => (
              <span
                key={k}
                className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700"
              >
                {kw}
                <button
                  type="button"
                  onClick={() => onRemoveKeyword(k)}
                  className="text-indigo-400 transition-colors hover:text-indigo-700"
                  aria-label={`Remove ${kw}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {/* Add-keyword input — commits on Enter, comma, or blur */}
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
          </div>
        </div>
      </div>
    </div>
  )
}
