"use client"

/**
 * Adjust a finished custom template, page by page.
 *
 * The PM writes what should change under any sheet of the preview, and
 * "Apply changes" starts a run on the server: it changes only those pages,
 * checks that every paragraph, figure, quote and table still prints, looks at
 * each note on the new pages, and saves the result as a new version. The old
 * version is kept, so the change can be undone.
 *
 * The run lives on the server, like a design run: this view follows it by its
 * ticket, and opening Adjust again on a page whose run is going finds it again
 * (the status is read on opening).
 *
 * Also here: the two small pieces the page panel shows once a template has
 * been adjusted, the result (AdjustResult) and the kept versions
 * (TemplateVersions).
 */

import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, CircleDashed, Loader2, Plus, Undo2, X,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { readError, type MutationError } from "@/hooks/useReportBuilder"
import {
  createDesignApi, type CustomAdjustment, type CustomTemplate, type CustomTemplateStatus, type DesignUnit,
} from "@/lib/api/createDesign"
import { renderSectionPages } from "@/lib/api/sectionBlocks"
import {
  MAX_ADJUST_NOTE_CHARS, MAX_TEMPLATE_NOTES, adjustNotesTooLong, adjustPayload, adjustResultLines,
  adjustResultSummary, countAdjustNotes, hasAdjustmentResult, notedSheets, retryNote, templatePage,
  versionLabel, type AdjustResultLine,
} from "@/lib/customAdjust"
import { CUSTOM_TEMPLATE_KEY, paperFor } from "@/lib/customTemplate"
import { pageSize, type LandscapeFormat, type Orientation } from "@/lib/orientation"

/** How often the run's progress is read while it is going. */
const POLL_MS = 3000
/**
 * When the screen stops waiting. An adjustment is at most two rounds of one
 * change, one print check and one look at each note (usually 3–6 minutes),
 * and it may first wait for a free design slot. Past this something is stuck.
 */
const GIVE_UP_MS = 20 * 60 * 1000

/** The notes of an Adjust view, kept by the page panel so they survive leaving the section. */
export interface AdjustNotes {
  /** Note per template page (1 = the first page after the title page). */
  pageNotes: Record<number, string>
  /** Whole-template notes: wishes to try again. */
  templateNotes: string[]
}

export function CustomAdjustView({
  cycleId,
  sectionCode,
  sectionTitle,
  unit,
  template,
  versions,
  orientation,
  format,
  maxWidth,
  sheet,
  onSheetChange,
  notes,
  onNotesChange,
  onClose,
  onDone,
  onStale,
}: {
  cycleId: string
  sectionCode: string
  sectionTitle: string
  unit: DesignUnit
  /** The custom template in use on the sheet on screen. */
  template: CustomTemplate
  /** Every version the screen has: the one in use and the kept ones. */
  versions: CustomTemplate[]
  orientation: Orientation
  format: LandscapeFormat
  /** How wide the page may be drawn (the page panel's rule). */
  maxWidth: number
  /** The sheet on screen (from 0), shared with the page panel. */
  sheet: number
  onSheetChange: (sheet: number) => void
  notes: AdjustNotes
  onNotesChange: (notes: AdjustNotes) => void
  onClose: () => void
  /** The adjustment was saved: read the screen's data again, then show it. */
  onDone: (adjustment: CustomAdjustment | undefined) => void
  /** The server has a newer adjustment than the screen: read the screen's data again. */
  onStale: () => void
}) {
  const paper = paperFor(orientation, format)
  const [drawn, setDrawn] = useState<{ pages: string[]; titlePage: boolean } | null>(null)
  const [drawError, setDrawError] = useState<string | null>(null)
  const [drawAttempt, setDrawAttempt] = useState(0)
  /** The run this view follows, while it goes (and the moment it is done). */
  const [run, setRun] = useState<CustomTemplateStatus | null>(null)
  /** A new design is being made for this page, so it can't be adjusted yet. */
  const [blocked, setBlocked] = useState(false)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const runIdRef = useRef<string | null>(null)

  // The newest props for the async callbacks below, which outlive a render.
  const latest = useRef({ versions, template, onDone, onStale })
  useEffect(() => {
    latest.current = { versions, template, onDone, onStale }
  })

  /** Follow a run by its ticket; it shows as running at once. */
  const followRun = useCallback((runId: string | null, status?: CustomTemplateStatus) => {
    runIdRef.current = runId
    setStartedAt(status?.started_at ? status.started_at * 1000 : Date.now())
    setNow(Date.now())
    setRun(status ?? { status: "running", step: "queued", message: "Waiting to start", run_id: runId ?? undefined })
  }, [])

  // Draw the pages afresh on opening. The answer says whether sheet 1 is the
  // section's title page, which the cached pictures don't record, and the
  // notes are written on exactly these pictures.
  useEffect(() => {
    let alive = true
    renderSectionPages(cycleId, {
      blocks: unit.blocks,
      title: unit.title,
      eyebrow: sectionTitle,
      running_label: "Annual Report",
      template_key: CUSTOM_TEMPLATE_KEY,
      breaks: unit.breaks,
      presentation: format === "presentation",
      section_code: sectionCode,
      orientation,
    })
      .then((result) => {
        if (alive) setDrawn({ pages: result.pages, titlePage: Boolean(result.divider) })
      })
      .catch((e) => {
        if (alive) setDrawError(readError(e as MutationError, "The pages could not be drawn."))
      })
    return () => {
      alive = false
    }
  }, [cycleId, sectionCode, sectionTitle, unit.blocks, unit.title, unit.breaks, format, orientation, drawAttempt])

  // On opening: is something already changing this page? An adjustment going
  // is followed; a new design going blocks Adjust until it is done; and an
  // adjustment that finished while the PM was elsewhere means the screen's
  // data is older than the server's.
  useEffect(() => {
    let alive = true
    createDesignApi.customTemplateStatus(cycleId, sectionCode, paper)
      .then((status) => {
        if (!alive) return
        if (status.status === "running" && status.kind === "adjust") {
          followRun(status.run_id ?? null, status)
        } else if (status.status === "running") {
          setBlocked(true)
        } else if (status.status === "done" && status.kind === "adjust" && status.adjustment) {
          const { versions: known, template: inUse } = latest.current
          const newer = status.adjustment.at > inUse.created_at
          if (newer && !hasAdjustmentResult(known, status.adjustment.at)) latest.current.onStale()
        }
      })
      .catch(() => {
        // Only a courtesy: the notes work without it.
      })
    return () => {
      alive = false
    }
  }, [cycleId, sectionCode, paper, followRun])

  // While the run goes: poll its ticket and tick the clock. Another server
  // process may answer "idle", or about an older run; only this run's own
  // answers count.
  const following = run !== null
  useEffect(() => {
    if (!following) return
    const poll = window.setInterval(async () => {
      let next: CustomTemplateStatus
      try {
        next = await createDesignApi.customTemplateStatus(cycleId, sectionCode, paper)
      } catch {
        return // a failed read counts as "not yet"
      }
      if (!runIdRef.current || next.run_id !== runIdRef.current) return
      if (next.status === "running") {
        setRun(next)
      } else if (next.status === "done") {
        runIdRef.current = null
        setRun(next)
        latest.current.onDone(next.adjustment)
      } else if (next.status === "failed") {
        runIdRef.current = null
        setRun(null)
        setError(next.summary || "Your changes could not be made, so nothing was changed.")
      }
    }, POLL_MS)
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      window.clearInterval(poll)
      window.clearInterval(tick)
    }
  }, [following, cycleId, sectionCode, paper])

  const total = drawn?.pages.length ?? 0
  const current = total ? Math.min(sheet, total - 1) : 0
  const sheetNumber = current + 1
  const page = drawn ? templatePage(sheetNumber, drawn.titlePage) : null
  const note = page === null ? "" : notes.pageNotes[page] ?? ""
  const count = countAdjustNotes(notes.pageNotes, notes.templateNotes)
  const tooLong = adjustNotesTooLong(notes.pageNotes, notes.templateNotes)
  const noted = drawn ? notedSheets(notes.pageNotes, drawn.titlePage) : []
  const retryable = (template.unmet ?? []).map(retryNote).filter((line) => !notes.templateNotes.includes(line))
  const flowing = template.mode !== "sheets"
  const paperSize = pageSize(orientation, format)
  const elapsed = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0
  const timedOut = run?.status === "running" && startedAt !== null && now - startedAt > GIVE_UP_MS

  const writeNote = (text: string) => {
    if (page === null) return
    onNotesChange({ ...notes, pageNotes: { ...notes.pageNotes, [page]: text } })
  }

  const addTemplateNote = (line: string) => {
    if (notes.templateNotes.length >= MAX_TEMPLATE_NOTES) return
    onNotesChange({ ...notes, templateNotes: [...notes.templateNotes, line] })
  }

  const removeTemplateNote = (index: number) => {
    onNotesChange({ ...notes, templateNotes: notes.templateNotes.filter((_, i) => i !== index) })
  }

  const apply = async () => {
    if (!drawn) return
    setStarting(true)
    setError(null)
    try {
      const answer = await createDesignApi.adjustCustomTemplate(
        cycleId, sectionCode, paper, adjustPayload(notes.pageNotes), notes.templateNotes, drawn.titlePage)
      if (answer.already_running) {
        setError("Something else is changing this page right now. Apply again once it has finished.")
        return
      }
      followRun(answer.run_id)
    } catch (e) {
      setError(readError(e as MutationError, "Your changes could not be started."))
    } finally {
      setStarting(false)
    }
  }

  const stopWaiting = () => {
    runIdRef.current = null
    setRun(null)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b px-5 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Adjust this template</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Write what should change under any sheet. A note changes only its own sheet.
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-8" onClick={onClose}>
          {run ? "Close" : "Cancel"}
        </Button>
      </div>

      {blocked ? (
        <div className="mx-auto w-full max-w-[620px] px-6 py-6">
          <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-4">
            <p className="text-[13px] font-semibold text-amber-900">A new design is being made for this page</p>
            <p className="mt-1 text-[12px] leading-relaxed text-amber-900">
              You can adjust it once that has finished.
            </p>
            <Button variant="outline" size="sm" className="mt-3 h-8" onClick={onClose}>
              Back
            </Button>
          </div>
        </div>
      ) : run ? (
        <div className="mx-auto w-full max-w-[620px] px-6 py-6" aria-live="polite">
          <RunLine status={run} elapsed={elapsed} timedOut={timedOut} onStopWaiting={stopWaiting} />
        </div>
      ) : (
        <>
          {total > 1 && (
            <div className="flex shrink-0 items-center justify-center gap-3 border-b bg-white px-5 py-1.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Previous sheet"
                onClick={() => onSheetChange(Math.max(0, current - 1))}
                disabled={current === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-[11px] tabular-nums text-slate-500">
                Sheet {sheetNumber} of {total}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Next sheet"
                onClick={() => onSheetChange(Math.min(total - 1, current + 1))}
                disabled={current >= total - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-5">
            <div className="mx-auto w-full" style={{ maxWidth }}>
              <div
                className="relative w-full overflow-hidden rounded-[6px] border border-slate-200 bg-white shadow-sm"
                style={{ aspectRatio: `${paperSize.width} / ${paperSize.height}` }}
              >
                {drawn?.pages[current] && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={drawn.pages[current]}
                    alt={`${unit.title}, sheet ${sheetNumber}`}
                    className="block h-full w-full object-contain"
                  />
                )}
                {!drawn && !drawError && (
                  <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Drawing your pages…
                  </div>
                )}
                {drawError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                    <p className="text-sm text-red-700">{drawError}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => {
                        setDrawError(null)
                        setDrawAttempt((a) => a + 1)
                      }}
                    >
                      Try again
                    </Button>
                  </div>
                )}
              </div>

              {drawn && page === null && (
                <p className="mt-3 rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-[12px] leading-relaxed text-slate-600">
                  This is the section&apos;s title page. It comes from the report&apos;s cover design,
                  not from this template, so a note can&apos;t change it here.
                </p>
              )}
              {drawn && page !== null && (
                <div className="mt-3">
                  <label htmlFor="adjust-note" className="block text-[12px] font-semibold text-slate-900">
                    What should change on sheet {sheetNumber}?
                  </label>
                  <textarea
                    id="adjust-note"
                    value={note}
                    onChange={(e) => writeNote(e.target.value)}
                    maxLength={MAX_ADJUST_NOTE_CHARS}
                    rows={3}
                    placeholder="For example: make the picture a rectangle instead of a circle, and move it to the top."
                    className="mt-1.5 w-full resize-y rounded-[10px] border border-slate-300 bg-white px-3 py-2 text-[13px] leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                  <div className="mt-0.5 flex justify-end text-[10.5px] tabular-nums text-slate-400">
                    {note.length} / {MAX_ADJUST_NOTE_CHARS}
                  </div>
                  {flowing && (
                    <p className="mt-1 text-[11px] leading-snug text-amber-800">
                      This template flows from page to page. A note turns it into page designs first,
                      with the same look, so this sheet can change on its own.
                    </p>
                  )}
                </div>
              )}

              {(notes.templateNotes.length > 0 || retryable.length > 0) && (
                <div className="mt-4 rounded-[10px] border border-slate-200 bg-white p-3">
                  {notes.templateNotes.length > 0 && (
                    <>
                      <p className="text-[12px] font-semibold text-slate-900">Try again, on the whole template</p>
                      <ul className="mt-1.5 space-y-1.5">
                        {notes.templateNotes.map((line, index) => (
                          <li
                            key={`${index}-${line}`}
                            className="flex items-start gap-2 rounded-[8px] bg-indigo-50 px-2.5 py-1.5 text-[11.5px] leading-snug text-indigo-900"
                          >
                            <span className="min-w-0 flex-1">{line}</span>
                            <button
                              type="button"
                              aria-label="Take this note out"
                              onClick={() => removeTemplateNote(index)}
                              className="shrink-0 rounded-sm p-0.5 text-indigo-500 hover:text-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {retryable.length > 0 && notes.templateNotes.length < MAX_TEMPLATE_NOTES && (
                    <>
                      <p className={"text-[11px] font-medium text-slate-500 " + (notes.templateNotes.length ? "mt-3" : "")}>
                        It couldn&apos;t fully do these before. Add any to this change:
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {retryable.map((line, index) => (
                          <button
                            key={`${index}-${line}`}
                            type="button"
                            onClick={() => addTemplateNote(line)}
                            className="inline-flex items-start gap-1 rounded-[12px] border border-slate-200 bg-white px-2.5 py-1 text-start text-[11px] leading-snug text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                          >
                            <Plus className="mt-px h-3 w-3 shrink-0" aria-hidden />
                            <span className="line-clamp-2">{line}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t bg-white px-5 py-3">
            {error && (
              <p className="mb-2 flex items-start gap-1.5 text-[12px] leading-snug text-red-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}
            {tooLong && (
              <p className="mb-2 text-[12px] text-red-700">
                Your notes are too long: at most {MAX_ADJUST_NOTE_CHARS} characters each, and 2,000 together.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Button variant="brand" onClick={apply} disabled={!drawn || count === 0 || tooLong || starting}>
                {starting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Apply changes{count ? ` (${count})` : ""}
              </Button>
              {noted.length > 0 && (
                <span className="text-[11px] text-slate-500">
                  Notes on{" "}
                  {noted.map((number, index) => (
                    <span key={number}>
                      {index > 0 && ", "}
                      <button
                        type="button"
                        onClick={() => onSheetChange(number - 1)}
                        className="font-medium text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
                      >
                        sheet {number}
                      </button>
                    </span>
                  ))}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
              About 3–6 minutes. Each change is checked on the new pages before it&apos;s saved, and
              you can undo it.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

/** The one progress line while the run goes, or the honest way out when it stalls. */
function RunLine({
  status,
  elapsed,
  timedOut,
  onStopWaiting,
}: {
  status: CustomTemplateStatus
  elapsed: number
  timedOut: boolean
  onStopWaiting: () => void
}) {
  const minutes = Math.floor(elapsed / 60)
  const seconds = String(elapsed % 60).padStart(2, "0")

  if (timedOut) {
    return (
      <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-4">
        <p className="text-[13px] font-semibold text-amber-900">This is taking longer than it should</p>
        <p className="mt-1 text-[12px] leading-relaxed text-amber-900">
          Your changes haven&apos;t come back in {GIVE_UP_MS / 60000} minutes. Your template is
          unchanged until they do. Go back to your notes to try again.
        </p>
        <Button variant="outline" size="sm" className="mt-3 h-8" onClick={onStopWaiting}>
          Back to your notes
        </Button>
      </div>
    )
  }

  if (status.status === "done") {
    return (
      <p className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
        <Check className="h-4 w-4 text-emerald-600" />
        Your changes are made. Opening them…
      </p>
    )
  }

  return (
    <>
      <p className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
        <Loader2 className="h-4 w-4 animate-spin text-indigo-600 motion-reduce:animate-none" />
        Making your changes
      </p>
      <p className="mt-1 text-[12px] text-slate-500">
        {status.message || "Working"} · {minutes}:{seconds} so far · usually 3–6 minutes
      </p>
      <p className="mt-3 text-[12px] leading-relaxed text-slate-600">
        Only the sheets you wrote on change, and each change is checked on the new pages before
        it&apos;s saved. You can work on other sections meanwhile: come back to this page to see
        how it&apos;s going.
      </p>
    </>
  )
}

/** The mark before one note of the result. */
function NoteMark({ state }: { state: AdjustResultLine["state"] }) {
  if (state === "done") return <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" aria-label="Done" />
  if (state === "not_quite") return <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" aria-label="Not quite" />
  return <CircleDashed className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" aria-label="Not checked" />
}

const PILL = "rounded-full px-2 py-0.5 text-[10.5px] font-semibold transition-colors "
const PILL_ON = "bg-emerald-600 text-white"
const PILL_OFF = "text-emerald-800 hover:bg-emerald-100"

/**
 * What the latest adjustment did, under the template's name: each note's
 * answer, Before | After, Undo, and "Try again" on a note that isn't quite
 * done.
 */
export function AdjustResult({
  adjustment,
  canCompare,
  showingBefore,
  onShowBefore,
  undoing,
  onUndo,
  onTryAgain,
}: {
  adjustment: CustomAdjustment
  /** The version it was changed from is still kept, so Before can be drawn and Undo bring it back. */
  canCompare: boolean
  showingBefore: boolean
  onShowBefore: (before: boolean) => void
  undoing: boolean
  onUndo: () => void
  onTryAgain: (line: AdjustResultLine) => void
}) {
  const lines = adjustResultLines(adjustment)
  const allDone = lines.every((line) => line.state === "done")
  return (
    <div className="mt-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-900">
          <Check className="h-3 w-3" />
          Adjusted · {adjustResultSummary(adjustment)}
        </p>
        {canCompare && (
          <div role="group" aria-label="Before or after the change" className="inline-flex rounded-full bg-white p-0.5 ring-1 ring-emerald-200">
            <button
              type="button"
              aria-pressed={showingBefore}
              onClick={() => onShowBefore(true)}
              className={PILL + (showingBefore ? PILL_ON : PILL_OFF)}
            >
              Before
            </button>
            <button
              type="button"
              aria-pressed={!showingBefore}
              onClick={() => onShowBefore(false)}
              className={PILL + (showingBefore ? PILL_OFF : PILL_ON)}
            >
              After
            </button>
          </div>
        )}
        {canCompare && (
          <button
            type="button"
            onClick={onUndo}
            disabled={undoing}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-900 underline underline-offset-2 disabled:opacity-60"
          >
            {undoing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
            Undo this change
          </button>
        )}
      </div>
      <details className="mt-1 text-[11px] text-emerald-950" open={allDone ? undefined : true}>
        <summary className="cursor-pointer select-none font-medium">What changed</summary>
        <ul className="mt-1 space-y-1.5">
          {lines.map((line, index) => (
            <li key={index} className="flex items-start gap-1.5">
              <NoteMark state={line.state} />
              <span className="min-w-0 flex-1 leading-snug">
                <span className="font-semibold">{line.where}:</span> {line.note}
                {line.says && <span className="block text-slate-600">{line.says}</span>}
              </span>
              {line.state === "not_quite" && (
                <button
                  type="button"
                  onClick={() => onTryAgain(line)}
                  className="shrink-0 font-semibold text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
                >
                  Try again
                </button>
              )}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

/** "20 Oct, 14:32": when a version was made, in the PM's own clock. */
function madeAt(iso: string): string {
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return ""
  return when.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

/** The kept older versions of the template, each one a click from coming back. */
export function TemplateVersions({
  versions,
  switching,
  onUse,
}: {
  versions: CustomTemplate[]
  switching: boolean
  onUse: (version: CustomTemplate) => void
}) {
  if (!versions.length) return null
  return (
    <details className="mt-1 text-[11px] text-slate-600">
      <summary className="cursor-pointer select-none font-medium">
        Earlier versions ({versions.length})
      </summary>
      <ul className="mt-1 space-y-1">
        {versions.map((version) => (
          <li key={version.created_at} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">
              {versionLabel(version)}
              {madeAt(version.created_at) && ` · ${madeAt(version.created_at)}`}
            </span>
            <button
              type="button"
              disabled={switching}
              onClick={() => onUse(version)}
              className="shrink-0 font-semibold text-indigo-700 underline underline-offset-2 hover:text-indigo-900 disabled:opacity-60"
            >
              Use this one
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}
