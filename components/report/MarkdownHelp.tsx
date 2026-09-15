"use client"

import { useState } from "react"
import { Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

// The editors this chip sits in work on raw Markdown SOURCE, not the rendered
// preview, so the symbols a reviewer might casually delete (a leading #, a pair
// of **) carry real meaning. One reference, opened on demand rather than shown
// inline on every edit, so it doesn't turn into another permanent banner.
//
// Sub-heading is `###`, not the `##` the board report teaches: this app emits
// section TITLES at `##` in the flat Markdown it assembles a report from, so a
// `##` inside a body would be ambiguous about which it is. The server
// normalises `#`/`##` in a body down to `###` anyway — the cheat sheet should
// teach what actually survives the round-trip.
const MARKDOWN_CHEATSHEET: { syntax: string; meaning: string; example: string }[] = [
  { syntax: "# text", meaning: "Heading", example: "# Overview" },
  { syntax: "### text", meaning: "Sub-heading", example: "### Key risks" },
  { syntax: "**text**", meaning: "Bold", example: "**material risk**" },
  { syntax: "*text*", meaning: "Italic", example: "*subject to change*" },
  { syntax: "- text", meaning: "Bullet list item", example: "- Commodity price risk" },
  { syntax: "1. text", meaning: "Numbered list item", example: "1. Safety" },
]

/**
 * The "what do the symbols mean?" chip and the cheat sheet it opens.
 *
 * Owns its own open state — a caller only has to drop it above a Markdown
 * textarea. Callers whose editor saves-or-cancels on blur pass `onOpenChange`
 * so they can ignore the blur this dialog causes; see the note on the handler.
 */
export function MarkdownHelpChip({
  className,
  onOpenChange,
}: {
  className?: string
  /**
   * Called with `true` from the chip's own click — synchronously, before the
   * dialog mounts and takes focus — and with `false` when the dialog closes.
   * An editor that reads a blur as "save or cancel" uses this to suppress the
   * one blur opening the cheat sheet causes; everyone else can omit it.
   */
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)

  const close = () => {
    setOpen(false)
    onOpenChange?.(false)
  }

  return (
    <>
      <button
        type="button"
        // A plain click lands only after mousedown has already moved focus off
        // the textarea — which a blur-to-save editor reads as the end of the
        // edit. preventDefault keeps focus put; the notification in onClick
        // covers the focus the dialog itself takes a moment later.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          onOpenChange?.(true)
          setOpen(true)
        }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 transition-colors hover:bg-indigo-100",
          className,
        )}
      >
        <Info className="h-3 w-3 shrink-0" />
        You&rsquo;re editing raw Markdown — what do the symbols mean?
      </button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>You&rsquo;re editing raw Markdown</DialogTitle>
            <DialogDescription>
              The box below is the source text, not the formatted preview. These
              symbols control how it renders — remove one by accident and that
              line loses its formatting once saved.
            </DialogDescription>
          </DialogHeader>

          <div>
            {MARKDOWN_CHEATSHEET.map((row) => (
              <div
                key={row.syntax}
                className="flex items-center gap-3 border-t border-slate-100 py-2"
              >
                <code className="w-24 shrink-0 rounded-md bg-indigo-50 px-2 py-1 text-center font-mono text-xs font-bold text-indigo-700">
                  {row.syntax}
                </code>
                <span className="w-28 shrink-0 text-xs font-semibold text-slate-900">
                  {row.meaning}
                </span>
                <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-500">
                  {row.example}
                </code>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button
              onClick={close}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
