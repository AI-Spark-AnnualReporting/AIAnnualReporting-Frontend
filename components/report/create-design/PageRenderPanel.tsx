"use client"

/**
 * The rendered page (or pages) beside the template cards.
 *
 * A template no longer caps its content, so one page unit can legitimately
 * run to several sheets — this shows all of them rather than the first,
 * because hiding the rest is exactly the content loss that change removed.
 *
 * Renders are cached per section, page and template, so returning to a
 * template you already looked at costs nothing. Every render is a cold
 * browser launch on the server, which is why that matters.
 *
 * A custom template can be adjusted here too: "Adjust" swaps the panel for
 * the Adjust view (CustomAdjustView), and once a template has been adjusted
 * its result, Before | After and Undo sit under its name.
 */

import { ChevronLeft, ChevronRight, Loader2, RefreshCw, SlidersHorizontal } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { usePatchSectionDesign } from "@/hooks/useCreateDesign"
import { readError, type MutationError } from "@/hooks/useReportBuilder"
import {
  createDesignApi, type CustomAdjustment, type DesignOption, type DesignUnit,
} from "@/lib/api/createDesign"
import { renderSectionPages } from "@/lib/api/sectionBlocks"
import { cacheKey, evict, getOrRender, peek } from "@/lib/createDesignCache"
import {
  losesContent, lossText, placementText, tablesOnlyUncounted, TABLES_ONLY_UNCOUNTED_TEXT,
} from "@/lib/createDesignLoss"
import { adjustResultSummary, retryNote, type AdjustResultLine } from "@/lib/customAdjust"
import {
  CUSTOM_TEMPLATE_KEY, customRenderFields, customTemplateFor, customTemplateHistory, paperFor,
  renderTemplateTag, versionRenderTag,
} from "@/lib/customTemplate"
import {
  pageSize, pickedKey, type LandscapeFormat, type Orientation,
} from "@/lib/orientation"

import { AdjustResult, CustomAdjustView, TemplateVersions, type AdjustNotes } from "./CustomAdjustView"
import { TEMPLATE_NAMES } from "./TemplateMini"

/**
 * How wide the page may be drawn. Every sheet gets the same type size a
 * portrait one does at 520px — 520 scaled by the sheet's width over the
 * portrait width — or turning the paper sideways (or onto the wider 16:9
 * sheet) would quietly shrink every word on it.
 */
function maxPageWidth(orientation: Orientation, format: LandscapeFormat = "a4"): number {
  if (orientation === "portrait") return 520
  const portrait = pageSize("portrait")
  return Math.round((520 * pageSize(orientation, format).width) / portrait.width)
}

/**
 * The line under the template name. The landscape template has no counts —
 * the art director never looked at it — so "Nothing to place" would be false;
 * it holds every content type, which is what is said instead. Never when the
 * card says it loses something (Borderless table): the red line under it
 * would say the opposite. A tables-only template with no counts (a section
 * extracted before it existed) says it has not been counted, in either
 * orientation — "nothing is dropped" and "nothing to place" would both be
 * false there.
 */
function placementLine(
  option: DesignOption | null,
  templateKey: string,
  orientation: Orientation,
): string {
  if (tablesOnlyUncounted(templateKey, option)) {
    return "Not counted yet for this section"
  }
  const counted = option && Object.keys(option.counts).length > 0
  const loses = option ? losesContent(option.dropped) : false
  if (orientation === "landscape" && !counted && !loses) {
    return "Every figure, paragraph, quote and table prints — nothing is dropped"
  }
  return placementText(option?.counts)
}

/**
 * What stands in for the page when a landscape section has no landscape pick.
 * Drawn the shape of the sideways sheet, so the panel does not change size
 * the moment a template is picked.
 */
function NoLandscapePickCard({ format }: { format: LandscapeFormat }) {
  const { width, height } = pageSize("landscape", format)
  return (
    <div className="flex h-full items-start justify-center overflow-y-auto bg-slate-100 p-5">
      <div
        className="flex w-full flex-col items-center justify-center gap-2 rounded-[6px] border border-dashed border-slate-300 bg-white p-8 text-center"
        style={{ maxWidth: maxPageWidth("landscape", format), aspectRatio: `${width} / ${height}` }}
      >
        <p className="text-sm font-medium text-slate-700">No landscape template yet</p>
        <p className="max-w-md text-[12px] leading-relaxed text-slate-500">
          This section prints in the plain two-column landscape layout. Pick a
          landscape template on the left, or use it for all sections from there.
        </p>
      </div>
    </div>
  )
}

/** An open Adjust view: the page it is for, and its notes so far. */
interface AdjustOpening extends AdjustNotes {
  /** Section, page and sheet, so the view shows only on the page it was opened on. */
  id: string
}

export function PageRenderPanel({
  cycleId,
  sectionCode,
  sectionTitle,
  unit,
  templateKey,
  option,
  onChoose,
  choosing,
  orientation = "portrait",
  format = "a4",
  onRecheck,
  rechecking = false,
  onAdjusted,
}: {
  cycleId: string
  sectionCode: string
  sectionTitle: string
  unit: DesignUnit
  templateKey: string | null
  option: DesignOption | null
  onChoose: (key: string) => void
  choosing: boolean
  /** Which way the page prints — sets the reserved shape and the pick compared against. */
  orientation?: Orientation
  /** The landscape sheet: A4 or the 16:9 presentation sheet. */
  format?: LandscapeFormat
  /** Check the custom template against the section's current content. */
  onRecheck?: () => void
  rechecking?: boolean
  /** Read the screen's data again after an adjustment; resolves when it is in. */
  onAdjusted?: () => Promise<unknown>
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  const [fetched, setFetched] = useState<{ key: string; pages: string[] } | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [page, setPage] = useState(0)
  const [adjusting, setAdjusting] = useState<AdjustOpening | null>(null)
  /** The template version whose "Before" is on screen (its created_at); null shows After. */
  const [beforeOf, setBeforeOf] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)
  const patchDesign = usePatchSectionDesign(cycleId)

  const custom = templateKey === CUSTOM_TEMPLATE_KEY
    ? customTemplateFor(unit, orientation, format)
    : null
  const history = custom ? customTemplateHistory(unit, orientation, format) : []
  // The version this one was adjusted from, while it is still kept: what
  // Before draws and Undo brings back.
  const before = custom?.adjusted_from
    ? history.find((version) => version.created_at === custom.adjusted_from) ?? null
    : null
  const showingBefore = Boolean(custom && before && beforeOf === custom.created_at)
  const renderVersion = showingBefore && before ? before.created_at : null
  const customPaper = paperFor(orientation, format)
  const pageId = `${sectionCode}|${unit.index}|${customPaper}`
  const adjustOpen = Boolean(custom && adjusting?.id === pageId)

  // Re-attached whenever the page box comes back. A landscape section with no
  // pick renders the placeholder card INSTEAD of that box, and the Adjust view
  // replaces it too, so observing only on mount would leave the box measuring
  // nothing and drawn at 320px.
  const hasPage = Boolean(templateKey)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasPage, adjustOpen])

  // Read the cache during render, not in an effect: a page you have already
  // looked at must appear immediately, and routing it through state would
  // flash a spinner on every hit.
  const key = templateKey
    ? cacheKey(cycleId, sectionCode, unit.index, renderVersion
      ? versionRenderTag(renderVersion, format)
      : renderTemplateTag(templateKey, unit, orientation, format))
    : null
  const cached = key ? peek(key) : undefined
  const pages = cached ?? (fetched && fetched.key === key ? fetched.pages : null)
  // Keyed so a stale failure cannot leak onto the next template.
  const error = failure && failure.key === key ? failure.message : null
  const loading = !!key && !pages && !error

  useEffect(() => {
    if (!key || cached) return

    let alive = true
    getOrRender(key, () =>
      renderSectionPages(cycleId, {
        blocks: unit.blocks,
        title: unit.title,
        eyebrow: sectionTitle,
        running_label: "Annual Report",
        template_key: templateKey ?? undefined,
        breaks: unit.breaks,
        presentation: format === "presentation",
        ...customRenderFields(templateKey, sectionCode, orientation),
        ...(renderVersion ? { custom_version: renderVersion } : {}),
      }).then((r) => r.pages),
    )
      .then((next) => {
        if (alive) setFetched({ key, pages: next })
      })
      .catch((e) => {
        // The server's own message, not axios's "Request failed with status
        // code 404" — the detail is the part a person can act on.
        if (alive)
          setFailure({
            key,
            message: readError(e as MutationError, "The page could not be rendered."),
          })
      })
    return () => {
      alive = false
    }
  }, [key, cached, cycleId, sectionCode, sectionTitle, unit, templateKey, attempt, format, orientation, renderVersion])

  // Clamp rather than reset, so flipping templates keeps you roughly where
  // you were in a multi-page unit.
  const total = pages?.length ?? 0
  const current = total ? Math.min(page, total - 1) : 0
  const paper = pageSize(orientation, format)
  const height = width ? (paper.height / paper.width) * width : 0

  if (!templateKey && orientation === "landscape") {
    return <NoLandscapePickCard format={format} />
  }

  if (!templateKey) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-400">
        Pick a template on the left to see this page.
      </div>
    )
  }

  const chosen = pickedKey(unit, orientation) === templateKey

  const openAdjust = (pageNotes: Record<number, string> = {}, templateNotes: string[] = []) => {
    setBeforeOf(null)
    setAdjusting({ id: pageId, pageNotes, templateNotes })
  }

  /** "Try again" on a note that isn't quite done: the same note, on the same page. */
  const tryNoteAgain = (line: AdjustResultLine) => {
    if (line.page === null) openAdjust({}, [retryNote(line.note)])
    else openAdjust({ [line.page]: line.note })
  }

  /** The adjustment is saved: read it back, then close the view on the new version. */
  const finishAdjust = (adjustment: CustomAdjustment | undefined) => {
    const close = () => {
      setAdjusting(null)
      toast.success("Template adjusted", {
        description: adjustment ? adjustResultSummary(adjustment) : undefined,
      })
    }
    if (onAdjusted) void onAdjusted().then(close, close)
    else close()
  }

  /** Make a kept version the one in use (Undo, or any earlier version). */
  const switchVersion = async (createdAt: string, done: string) => {
    setSwitching(true)
    try {
      const { design } = await createDesignApi.switchCustomTemplateVersion(cycleId, sectionCode, customPaper, createdAt)
      patchDesign(sectionCode, design)
      setBeforeOf(null)
      toast.success(done)
    } catch (e) {
      toast.error(readError(e as MutationError, "Could not switch to that version"))
    } finally {
      setSwitching(false)
    }
  }

  if (custom && adjusting && adjustOpen) {
    return (
      <CustomAdjustView
        key={pageId}
        cycleId={cycleId}
        sectionCode={sectionCode}
        sectionTitle={sectionTitle}
        unit={unit}
        template={custom}
        versions={[custom, ...history]}
        orientation={orientation}
        format={format}
        maxWidth={maxPageWidth(orientation, format)}
        sheet={page}
        onSheetChange={setPage}
        notes={adjusting}
        onNotesChange={(notes) => setAdjusting({ ...notes, id: pageId })}
        onClose={() => setAdjusting(null)}
        onDone={finishAdjust}
        onStale={() => void onAdjusted?.()}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b px-5 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {TEMPLATE_NAMES[templateKey] ?? templateKey}
            {total > 1 && (
              <span className="ms-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                {total} sheets
              </span>
            )}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {placementLine(option, templateKey, orientation)}
          </p>
          {/* Loss is no longer a layout trade-off a person chooses between —
              every template holds everything — so this is a defect notice,
              not a caption, and it is styled like one. */}
          {option && losesContent(option.dropped) && (
            <p className="mt-0.5 text-[11px] font-semibold text-red-700">
              Content missing: {lossText(option.dropped, option.counts)}
            </p>
          )}
          {/* With no counts there is no loss to list, but a tables-only
              template still leaves the rest out, so it is still flagged. */}
          {tablesOnlyUncounted(templateKey, option) && (
            <p className="mt-0.5 text-[11px] font-semibold text-red-700">
              Content missing: {TABLES_ONLY_UNCOUNTED_TEXT}
            </p>
          )}
          {custom?.brief?.summary_for_pm && (
            <p className="mt-0.5 line-clamp-2 text-[11px] italic text-indigo-700">
              {custom.brief.summary_for_pm}
            </p>
          )}
          {custom?.adjustment && (
            <AdjustResult
              adjustment={custom.adjustment}
              canCompare={Boolean(before)}
              showingBefore={showingBefore}
              onShowBefore={(on) => setBeforeOf(on ? custom.created_at : null)}
              undoing={switching}
              onUndo={() => {
                if (before) void switchVersion(before.created_at, "Change undone: the version before it is back")
              }}
              onTryAgain={tryNoteAgain}
            />
          )}
          {!!custom?.unmet?.length && (
            <div className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5">
              <p className="text-[11px] font-semibold text-amber-900">
                Couldn&apos;t fully do{custom.requirements?.length
                  ? ` (${custom.requirements.length - custom.unmet.length} of ${custom.requirements.length} wishes met)`
                  : ""}:
              </p>
              <ul className="mt-0.5 space-y-0.5 text-[11px] leading-snug text-amber-900">
                {custom.unmet.map((line, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="line-clamp-2 min-w-0 flex-1">{line}</span>
                    <button
                      type="button"
                      onClick={() => openAdjust({}, [retryNote(line)])}
                      className="shrink-0 font-semibold underline underline-offset-2 hover:text-amber-950"
                    >
                      Try again
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {custom && (
            <TemplateVersions
              versions={history}
              switching={switching}
              onUse={(version) => void switchVersion(version.created_at, "Switched to that version")}
            />
          )}
          {!!custom?.unchecked?.length && (
            <p className="mt-1 text-[11px] text-slate-500">
              Not checked against your request: the reviewer didn&apos;t respond
              ({custom.unchecked.length} {custom.unchecked.length === 1 ? "wish" : "wishes"}).
            </p>
          )}
          {custom?.needs_recheck && (
            <p className="mt-1 flex items-center gap-2 text-[11px] text-amber-800">
              This section was re-extracted after the layout was made, so it may no longer fit.
              {onRecheck && (
                <button
                  type="button"
                  onClick={onRecheck}
                  disabled={rechecking}
                  className="inline-flex items-center gap-1 font-semibold text-amber-900 underline underline-offset-2 disabled:opacity-60"
                >
                  {rechecking && <Loader2 className="h-3 w-3 animate-spin" />}
                  Check it again
                </button>
              )}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {custom && (
            <Button variant="outline" size="sm" className="h-8" onClick={() => openAdjust()}>
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
              Adjust
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => {
              // Evict first, or the effect short-circuits on the cache hit
              // and the button does nothing at all.
              if (key) evict(key)
              setFetched(null)
              setFailure(null)
              setAttempt((a) => a + 1)
            }}
            disabled={loading}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Re-render
          </Button>
          <Button
            size="sm"
            variant={chosen ? "outline" : "brand"}
            className="h-8"
            onClick={() => onChoose(templateKey)}
            disabled={choosing || chosen}
          >
            {choosing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {chosen ? "Selected" : "Use this template"}
          </Button>
        </div>
      </div>

      {total > 1 && (
        <div className="flex shrink-0 items-center justify-center gap-3 border-b bg-white px-5 py-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Previous sheet"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={current === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-[11px] tabular-nums text-slate-500">
            Sheet {current + 1} of {total}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Next sheet"
            onClick={() => setPage((p) => Math.min(total - 1, p + 1))}
            disabled={current >= total - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-5">
        <div
          ref={wrapRef}
          className="mx-auto w-full"
          style={{ maxWidth: maxPageWidth(orientation, format) }}
        >
          <div
            className="relative w-full overflow-hidden rounded-[6px] border border-slate-200 bg-white shadow-sm"
            style={{ height: height || undefined, minHeight: height ? undefined : 320 }}
          >
            {pages && pages[current] && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={pages[current]}
                alt={`${unit.title} as ${TEMPLATE_NAMES[templateKey] ?? templateKey}, sheet ${current + 1}` +
                  (showingBefore ? ", before your changes" : "")}
                className="block h-full w-full object-contain"
              />
            )}
            {showingBefore && (
              <span className="absolute start-2 top-2 rounded-full bg-slate-900/80 px-2 py-0.5 text-[10.5px] font-semibold text-white">
                Before your changes
              </span>
            )}
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Rendering…
              </div>
            )}
            {error && !loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm text-red-700">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => {
                    if (key) evict(key)
                    setFailure(null)
                    setAttempt((a) => a + 1)
                  }}
                >
                  Try again
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
