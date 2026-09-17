"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Save, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { MarkdownHelpChip } from "@/components/report/MarkdownHelp"
import { cn } from "@/lib/utils"

const DEFAULT_PLACEHOLDER = "### Sub-heading\n\nWrite the section body here…"

/**
 * The section body as raw Markdown, in a textarea that grows with its text.
 *
 * Saves on blur, on ⌘/Ctrl-Enter and on the Save button; Escape cancels.
 * Unchanged text is deliberately never sent — a no-op PUT would still mark the
 * section hand-edited. Ported from the board report's ProseEditor so the two
 * reports behave the same way under the same fingers.
 *
 * Lives in its own module because every screen that edits a section body uses
 * this one copy: the AI-written sections (GenerateSection) and the typed /
 * extracted ones (ContentSection). Same keys, same guards, one place to fix.
 * The caller owns whether the editor is open and what happens on save.
 */
export function SectionBodyEditor({
  value,
  baseline = value,
  saving,
  isRtl,
  autoFocus = true,
  placeholder = DEFAULT_PLACEHOLDER,
  warn,
  onSave,
  onCancel,
}: {
  /** Text the editor opens on. */
  value: string
  /**
   * The server's text, which "unchanged" is measured against. Defaults to
   * `value` — pass it only when the editor opens on text the server does NOT
   * hold (a pre-fill), so Save stays live for content the PM never edits.
   */
  baseline?: string
  saving: boolean
  isRtl: boolean
  /**
   * Whether to take focus on open. True when a pencil opened the editor — the
   * PM asked for it. False when something else did (a pre-fill), where stealing
   * the caret and scrolling the page would be an answer to a question nobody
   * asked; a box that was never focused also can't blur, so an unread pre-fill
   * can't save itself on the first stray click.
   */
  autoFocus?: boolean
  placeholder?: string
  /**
   * Optional per-keystroke check on the draft. A non-null return is shown under
   * the box and blocks saving — used for the cycle's content language. Blur
   * leaves a blocked edit open rather than discarding it.
   */
  warn?: (draft: string) => string | null
  onSave: (content: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(value)
  const taRef = useRef<HTMLTextAreaElement>(null)
  // The text this editor opened on. A background refetch can move `value` while
  // the PM is typing, so "unchanged" has to mean "unchanged since I started",
  // not "same as whatever the cache holds this instant". State rather than a
  // ref because it is read during render, to decide whether Save is live.
  const [openedOn] = useState(baseline)
  // A blur normally means "I'm done" — except when something else has already
  // decided. Escape and Cancel set this, and so does the cheat sheet, which
  // takes focus on purpose and must not end the edit.
  const skipBlur = useRef(false)

  // Size the box to its text on open and — when the PM asked for the editor —
  // focus it, with the caret at the end rather than wherever the click landed.
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
    if (!autoFocus) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [autoFocus])

  const trimmed = draft.trim()
  const changed = trimmed !== openedOn.trim()
  const warning = warn?.(draft) ?? null

  const commit = () => {
    if (saving || !trimmed || !changed || warning) return
    onSave(trimmed)
  }

  return (
    <div className="space-y-3">
      <MarkdownHelpChip
        onOpenChange={(open) => {
          if (open) {
            skipBlur.current = true
            return
          }
          // The dialog is still mounted here and its focus trap bounces any
          // focus taken back too early — and that bounce arrives as a blur,
          // i.e. as "the edit is over". Wait a frame: by then it has unmounted
          // and handed focus back to the textarea itself, and dropping the
          // guard is safe.
          requestAnimationFrame(() => {
            taRef.current?.focus()
            skipBlur.current = false
          })
        }}
      />
      <Textarea
        ref={taRef}
        value={draft}
        disabled={saving}
        rows={14}
        dir={isRtl ? "rtl" : "ltr"}
        aria-label="Section content (Markdown)"
        placeholder={placeholder}
        onChange={(e) => {
          setDraft(e.target.value)
          // Grow with the text instead of scrolling inside a fixed window — a
          // section body is reviewed as a whole.
          e.target.style.height = "auto"
          e.target.style.height = `${e.target.scrollHeight}px`
        }}
        onBlur={() => {
          if (skipBlur.current || saving) return
          // Blocked text is kept on screen: clicking away must not throw away
          // an edit the PM still has to fix.
          if (warning && changed) return
          if (trimmed && changed) onSave(trimmed)
          else onCancel()
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault()
            skipBlur.current = true
            onCancel()
          } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            commit()
          }
        }}
        className={cn(
          "resize-none rounded-xl text-sm leading-relaxed",
          isRtl && "text-right",
        )}
      />
      {warning && <p className="text-xs text-amber-600">{warning}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={commit}
          // Clicking away already saves, but nobody should have to know that:
          // without this, mousedown blurs the textarea and saves once, then the
          // click saves a second time.
          onMouseDown={(e) => e.preventDefault()}
          disabled={saving || !trimmed || !changed || !!warning}
          className="bg-indigo-600 text-white hover:bg-indigo-700"
          title={
            !trimmed
              ? "Add some content before saving"
              : warning
                ? warning
                : !changed
                  ? "No changes to save"
                  : "Save (⌘+Enter)"
          }
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="ghost"
          onClick={onCancel}
          onMouseDown={(e) => {
            e.preventDefault()
            skipBlur.current = true
          }}
          disabled={saving}
        >
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <span className="ml-auto text-xs text-slate-400">
          Saves when you click away · ⌘+Enter to save · Esc to cancel
        </span>
      </div>
    </div>
  )
}
