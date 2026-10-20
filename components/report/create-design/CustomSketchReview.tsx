"use client"

/**
 * The sketch review: the PM steps through the section's page LAYOUTS (not its
 * printed pages: layouts repeat, and the page count moves with the text),
 * leaves a note on any of them, and asks for the next version.
 *
 * Holds only what is on screen (which layout is shown). The notes belong to
 * the panel, which keeps them in the browser tab so closing the panel does not
 * lose them.
 */

import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, MessageSquareText, RotateCcw, Sparkles } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import type { CustomSketchRecord, SketchVersion } from "@/lib/api/createDesign"
import {
  MAX_NOTE_CHARS, countNotes, estimateLayoutPages, layoutName, layoutTag, notesPayload,
  notesTooLong, pagesText, type SketchContent,
} from "@/lib/customSketch"

import { CustomSketchDrawing } from "./CustomSketchDrawing"

const NOTE_BOX =
  "w-full resize-y rounded-[10px] border border-slate-300 bg-white px-3 py-2 text-[12.5px] leading-relaxed " +
  "text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"

/** "page 1" / "pages 2, 4 and 6", or what the end page is for. */
function usedOn(layoutId: string, pages: Record<string, number[]>, endPage: boolean): string {
  if (layoutId === "end") {
    return endPage ? "after the last page" : "only used if tables or extra figures need it"
  }
  return `${pagesText(pages[layoutId] ?? [])} (about)`
}

export function CustomSketchReview({
  record,
  version,
  content,
  rtl,
  notes,
  allPages,
  busy,
  building,
  error,
  onNotesChange,
  onShowVersion,
  onUpdate,
  onBuild,
  onStartOver,
}: {
  record: CustomSketchRecord
  /** The version on screen (not always the newest: older ones can be reopened). */
  version: SketchVersion
  content: SketchContent
  /** Draw the layouts right to left (an Arabic report). */
  rtl: boolean
  /** Unsent notes for this version, by layout id. */
  notes: Record<string, string>
  allPages: string
  /** A sketch is being made: nothing can be sent until it is back. */
  busy: boolean
  /** The finished template is being started from this version. */
  building: boolean
  error: string | null
  onNotesChange: (notes: Record<string, string>, allPages: string) => void
  onShowVersion: (versionNumber: number) => void
  onUpdate: () => void
  /** Build the finished template from the version on screen. */
  onBuild: () => void
  onStartOver: () => void
}) {
  const [shown, setShown] = useState(0)
  const layouts = version.sketch.layouts
  const current = Math.min(shown, layouts.length - 1)
  const layout = layouts[current]
  const plan = estimateLayoutPages(version.sketch, record.page_pt, content)
  const payload = notesPayload(notes, allPages, layouts.map((each) => each.id))
  const noteCount = countNotes(payload)
  const tooLong = notesTooLong(payload)

  const numbers = record.versions.map((each) => each.version).sort((a, b) => a - b)
  const position = numbers.indexOf(version.version)
  const older = position > 0 ? numbers[position - 1] : null
  const newer = position >= 0 && position < numbers.length - 1 ? numbers[position + 1] : null

  const jumpTo = (layoutId: string) => {
    const index = layouts.findIndex((each) => each.id === layoutId)
    if (index >= 0) setShown(index)
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-slate-900">Your sketch</p>
          {version.sketch.concept && (
            <p className="mt-1 text-[12px] italic leading-relaxed text-indigo-700">{version.sketch.concept}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Older version"
            title={noteCount > 0 ? "Send or clear your notes first" : undefined}
            disabled={older === null || busy || noteCount > 0}
            onClick={() => older !== null && onShowVersion(older)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tabular-nums">
            Version {version.version}
            {newer === null ? " · newest" : ""}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Newer version"
            title={noteCount > 0 ? "Send or clear your notes first" : undefined}
            disabled={newer === null || busy || noteCount > 0}
            onClick={() => newer !== null && onShowVersion(newer)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!!version.sketch.cannot_do.length && (
        <ul className="mt-2 list-disc space-y-0.5 ps-4 text-[11px] text-amber-800">
          {version.sketch.cannot_do.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}

      {!!version.replies.length && (
        <div className="mt-3 rounded-[10px] border border-emerald-200 bg-emerald-50 p-3">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-900">
            <MessageSquareText className="h-3.5 w-3.5" />
            What changed{version.based_on ? ` (your notes on version ${version.based_on})` : ""}
          </p>
          <ul className="mt-1.5 space-y-1 text-[11.5px] leading-snug text-emerald-900">
            {version.replies.map((reply, i) => (
              <li key={i}>
                {reply.layout && <span className="font-semibold">{reply.layout}: </span>}
                {reply.reply}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The page order: which layout each page uses. Click one to see it. */}
      <div className="mt-4 flex flex-wrap items-center gap-1" aria-label="Page order">
        <span
          className="rounded-md border border-dashed border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10.5px] text-slate-400"
          title="The section's title page, printed in your report's style before these pages"
        >
          Title page
        </span>
        {plan.order.map((layoutId, index) => (
          <button
            key={index}
            type="button"
            onClick={() => jumpTo(layoutId)}
            className={
              "rounded-md border px-1.5 py-0.5 text-[10.5px] tabular-nums transition-colors " +
              (layoutId === layout.id
                ? "border-indigo-400 bg-indigo-50 font-semibold text-indigo-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300")
            }
          >
            {index + 1} {layoutTag(layoutId)}
          </button>
        ))}
        {plan.endPage && (
          <button
            type="button"
            onClick={() => jumpTo("end")}
            className={
              "rounded-md border px-1.5 py-0.5 text-[10.5px] transition-colors " +
              (layout.id === "end"
                ? "border-indigo-400 bg-indigo-50 font-semibold text-indigo-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300")
            }
          >
            End
          </button>
        )}
      </div>

      {/* One layout at a time, with its own note. */}
      <div className="mt-3 rounded-[10px] border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold text-slate-900">{layoutName(layout.id)}</p>
            <p className="text-[11px] text-slate-500">Used on {usedOn(layout.id, plan.pages, plan.endPage)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Previous layout"
              onClick={() => setShown(Math.max(0, current - 1))}
              disabled={current === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-[11px] tabular-nums text-slate-500">
              Layout {current + 1} of {layouts.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Next layout"
              onClick={() => setShown(Math.min(layouts.length - 1, current + 1))}
              disabled={current >= layouts.length - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mx-auto mt-3" style={{ maxWidth: record.page_pt[0] >= record.page_pt[1] ? 520 : 360 }}>
          <CustomSketchDrawing layout={layout} facts={record} rtl={rtl} />
        </div>
        {layout.summary && <p className="mt-2 text-[11.5px] leading-snug text-slate-600">{layout.summary}</p>}

        <label htmlFor={`sketch-note-${layout.id}`} className="mt-3 block text-[11.5px] font-medium text-slate-700">
          What should change on this layout?
        </label>
        <textarea
          id={`sketch-note-${layout.id}`}
          rows={2}
          maxLength={MAX_NOTE_CHARS}
          value={notes[layout.id] ?? ""}
          disabled={busy}
          placeholder="For example: make the image bigger, or a rectangle instead of a circle."
          onChange={(e) => onNotesChange({ ...notes, [layout.id]: e.target.value }, allPages)}
          className={`mt-1 ${NOTE_BOX}`}
        />
      </div>

      <label htmlFor="sketch-note-all" className="mt-4 block text-[11.5px] font-medium text-slate-700">
        A note for all pages
      </label>
      <textarea
        id="sketch-note-all"
        rows={2}
        maxLength={MAX_NOTE_CHARS}
        value={allPages}
        disabled={busy}
        placeholder="For example: use rectangles, not circles."
        onChange={(e) => onNotesChange(notes, e.target.value)}
        className={`mt-1 ${NOTE_BOX}`}
      />

      {tooLong && (
        <p className="mt-2 text-[11px] text-red-700">
          The notes are too long together; shorten some of them.
        </p>
      )}
      {error && (
        <p className="mt-3 flex items-start gap-1.5 text-[12px] text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          variant="brand"
          onClick={onBuild}
          disabled={busy || building || noteCount > 0}
          title={noteCount > 0 ? "Send or clear your notes first" : undefined}
        >
          {building ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
          Build this design
        </Button>
        <Button variant="outline" onClick={onUpdate} disabled={busy || building || noteCount === 0 || tooLong}>
          {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {noteCount === 0 ? "Update sketch" : `Update sketch (${noteCount} ${noteCount === 1 ? "note" : "notes"})`}
        </Button>
        <Button variant="ghost" size="sm" className="h-8" onClick={onStartOver} disabled={busy || building}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Start over
        </Button>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-slate-500">
        {noteCount > 0
          ? "You have notes that aren't sent yet: update the sketch with them, or clear them, before building."
          : "Notes apply only to the layout you write them on; each layout may repeat on several pages. " +
            "Building the finished design takes about 5–15 minutes; you can work on other sections meanwhile."}
      </p>
    </div>
  )
}
