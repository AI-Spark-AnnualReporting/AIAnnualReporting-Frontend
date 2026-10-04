"use client"

/**
 * The whole report as a run of pages, in place of the designer.
 *
 * It used to be a dialog capped at 900px floating over a screen whose own
 * preview column is capped at 520px — a small window over a smaller one. Now
 * it takes the pane, the rail collapses behind it, and the page gets the room.
 *
 * It starts where the report starts: the cover, then the contents page, then
 * each section opening on its divider. Those first two come from their own
 * endpoints rather than from the section run, which is why the preview used to
 * begin at section one and quietly disagree with the file.
 *
 * Only pages with a template chosen are rendered — an unchosen page shows a
 * placeholder card rather than quietly falling back to the recommendation,
 * because a preview that invents choices is not a preview of your report.
 *
 * Cache-first, then two renders in flight. Two rather than four because each
 * one is a cold browser launch on the container that also serves real PDF
 * exports.
 *
 * ZOOM RE-RASTERISES rather than magnifying. These pages are PNGs, so scaling
 * one in CSS only makes its pixels bigger; the engine takes a `scale` and the
 * pages someone is actually looking at are re-fetched at the density the
 * screen can show. See scaleFor.
 */

import { useQueryClient } from "@tanstack/react-query"
import { Loader2, RefreshCw, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { annualDesignApi } from "@/lib/api/annual-design"
import type { CycleDesign } from "@/lib/api/createDesign"
import { renderSectionPages } from "@/lib/api/sectionBlocks"
import { mapWithConcurrency } from "@/lib/concurrency"
import { cacheKey, evict, getOrRender, peek } from "@/lib/createDesignCache"

import { clampZoom, PreviewZoomBar, stepZoom } from "./PreviewZoomBar"

const CONCURRENCY = 2

/** A4, for reserving a page's height before its image has decoded. */
const PAGE_W = 595.28
const RATIO = 841.89 / PAGE_W

/** The scroller's p-5, both sides. */
const GUTTER = 40

/** As wide as a page is worth showing; past this it is bigger than paper. */
const MAX_FIT_W = 1100

/**
 * What the engine rasterises at by default: 1191px across A4.
 *
 * Fine for a thumbnail, and NOT fine enough for a page shown full width on a
 * Retina screen — that wants 2200 device pixels and gets 1191. The preview has
 * always been soft there, before anyone zoomed anything.
 */
const BASE_SCALE = 2

/**
 * The scale a page needs to look sharp at a given CSS width, rounded up to a
 * whole stop so nudging the zoom does not re-render the world for a difference
 * nobody can see. Capped at 4, which the engine enforces too — the pixmap
 * grows with the square of this number.
 */
const scaleFor = (cssWidth: number) => {
  const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2)
  const needed = (cssWidth * dpr) / PAGE_W
  if (needed <= BASE_SCALE + 0.05) return BASE_SCALE
  return Math.min(4, Math.ceil(needed))
}

interface Page {
  key: string
  caption: string
  /** What to say in the placeholder when nothing has been chosen. */
  missing: string
  templateKey: string | null
  render: (scale?: number) => Promise<string[]>
}

export function PreviewAllPanel({
  cycleId,
  design,
  coverKey,
  tocKey,
  onExit,
}: {
  cycleId: string
  design: CycleDesign | undefined
  coverKey: string | null
  tocKey: string | null
  onExit: () => void
}) {
  const qc = useQueryClient()
  // One entry per page unit, each holding every sheet that unit produced.
  const [urls, setUrls] = useState<Record<string, string[]>>({})
  const [failed, setFailed] = useState<Record<string, string>>({})
  const [done, setDone] = useState(0)
  // Mounted only while previewing, so the run starts immediately and these
  // initialise rather than being reset by the effect. That leaves the effect
  // with no synchronous setState, which this repo's lint forbids outright.
  const [running, setRunning] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const abort = useRef<AbortController | null>(null)

  // 1 = the page filling the pane, so the opening view is 100% at any window
  // size and "Fit width" is a reset rather than a mode.
  const [zoom, setZoom] = useState(1)
  const [pane, setPane] = useState({ w: 0, h: 0 })
  const scrollRef = useRef<HTMLDivElement | null>(null)
  // Sharper re-renders, deliberately OUT of the shared module cache: that is
  // an LRU of 240 entries holding base64 strings, and a report's worth of 4x
  // pages would be hundreds of megabytes evicting everything else. These die
  // with the preview, which is the right lifetime for them.
  const [sharp, setSharp] = useState<Record<string, string[]>>({})
  const [visible, setVisible] = useState<string[]>([])
  const figures = useRef(new Map<string, HTMLElement>())
  // Sharp renders already asked for. Scrolling re-fires the observer, which
  // restarts the queue below — without this the restart re-requests a page
  // whose render is still in flight, and every one of those is a cold browser
  // launch thrown away.
  const asked = useRef(new Set<string>())

  const baseW = Math.max(240, Math.min(pane.w - GUTTER, MAX_FIT_W))
  const pageW = pane.w ? baseW * zoom : 0
  const pageH = pageW * RATIO

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setPane({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pages: Page[] = [
    // The report's own front matter. Keyed in the same namespace as the
    // section units so one cache serves both, with codes no section can
    // collide with — revokeSection prefix-matches on the code, and no real
    // section_code begins with an underscore.
    {
      key: cacheKey(cycleId, "__cover__", 0, coverKey ?? "none"),
      caption: "Cover",
      missing: "No cover chosen",
      templateKey: coverKey,
      // Through the query client, not a bare call: the cover picker caches its
      // preview under this exact key with staleTime Infinity, so a PM who just
      // chose a cover would otherwise pay a second cold browser launch for an
      // image already on screen a moment ago. A sharper scale is its own
      // entry, so it never displaces the one the picker is showing.
      render: (scale) =>
        qc
          .fetchQuery({
            // The scale is appended only when there IS one: at base scale the
            // key must be exactly the picker's five-element key, or this is a
            // different cache entry and the reuse above never happens.
            queryKey: ["pm", "cycle", cycleId, "cover-preview", coverKey, ...(scale ? [scale] : [])],
            queryFn: () =>
              annualDesignApi.previewCover(cycleId, coverKey as string, scale),
            staleTime: Infinity,
            retry: false,
          })
          .then((r) => r.pages),
    },
    {
      key: cacheKey(cycleId, "__contents__", 0, tocKey ?? "none"),
      caption: "Contents",
      missing: "No contents design chosen",
      templateKey: tocKey,
      render: (scale) =>
        qc
          .fetchQuery({
            // Same five-element shape as the contents picker at base scale —
            // see the note on the cover key above.
            queryKey: ["pm", "cycle", cycleId, "toc-preview", tocKey, ...(scale ? [scale] : [])],
            queryFn: () => annualDesignApi.previewToc(cycleId, tocKey as string, scale),
            staleTime: Infinity,
            retry: false,
          })
          .then((r) => r.pages),
    },
  ]
  const sections = [...(design?.sections ?? [])]
    .filter((s) => s.eligible && s.section_code !== "table_of_contents")
    .sort((a, b) => a.order - b.order)
  for (const section of sections) {
    for (const unit of section.design?.units ?? []) {
      pages.push({
        key: cacheKey(cycleId, section.section_code, unit.index, unit.template_key ?? "none"),
        caption:
          unit.total > 1
            ? `${section.title} · page ${unit.index} of ${unit.total}`
            : section.title,
        missing: "No template chosen",
        templateKey: unit.template_key,
        render: (scale) =>
          renderSectionPages(cycleId, {
            blocks: unit.blocks,
            title: unit.title,
            eyebrow: section.title,
            running_label: "Annual Report",
            template_key: unit.template_key ?? undefined,
            // The same breaks PageRenderPanel sends. Both surfaces write the
            // SAME cache key, so omitting them here meant whichever drew first
            // won and the two could disagree about where a page broke.
            breaks: unit.breaks,
            scale,
          }).then((r) => r.pages),
      })
    }
  }
  const chosen = pages.filter((p) => p.templateKey)

  useEffect(() => {
    const ac = new AbortController()
    abort.current = ac

    void mapWithConcurrency(
      chosen,
      CONCURRENCY,
      async (page) => {
        try {
          const sheets = await getOrRender(page.key, () => page.render())
          setUrls((prev) => ({ ...prev, [page.key]: sheets }))
        } catch (e) {
          // Without this the spinner never stops. The preview has no
          // per-page re-render button of its own, so a failure here used to
          // be a page that simply span forever.
          setFailed((prev) => ({
            ...prev,
            [page.key]: e instanceof Error ? e.message : "Could not draw this page.",
          }))
        }
      },
      { signal: ac.signal, onSettled: (n) => setDone(n) },
    ).then(() => setRunning(false))

    return () => ac.abort()
    // chosen is derived from design; keying on the count is enough and keeps
    // this from re-running on every unrelated cache write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen.length, cycleId, attempt])

  // ── which pages are on screen ─────────────────────────────────────────
  // Drives two things at once: the header's "where am I", and which pages are
  // worth re-rendering sharply. A generous margin so a page is ready slightly
  // before it is scrolled to.
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const seen = new Set<string>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const key = (e.target as HTMLElement).dataset.pageKey
          if (!key) continue
          if (e.isIntersecting) seen.add(key)
          else seen.delete(key)
        }
        setVisible([...seen])
      },
      { root, rootMargin: "200px 0px 200px 0px", threshold: 0.01 },
    )
    figures.current.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [pages.length])

  // ── sharpen what is on screen ─────────────────────────────────────────
  const wantScale = scaleFor(pageW)
  useEffect(() => {
    if (wantScale <= BASE_SCALE || !visible.length) return
    const queue = pages.filter(
      (p) =>
        p.templateKey &&
        visible.includes(p.key) &&
        !asked.current.has(`${p.key}|s${wantScale}`),
    )
    if (!queue.length) return
    let cancelled = false

    // One at a time, and never through the shared cache. A sharp render is a
    // cold browser launch; the run above already has two in flight and this
    // must not become a third and a fourth. Re-checked each iteration so
    // scrolling past a page stops paying for it.
    void (async () => {
      for (const page of queue) {
        if (cancelled) return
        const id = `${page.key}|s${wantScale}`
        if (asked.current.has(id)) continue
        asked.current.add(id)
        try {
          const sheets = await page.render(wantScale)
          // Kept even if this effect has since been cancelled: the render was
          // paid for, and the page is very likely still in the run.
          setSharp((prev) => ({ ...prev, [id]: sheets }))
        } catch {
          // An upgrade, never a requirement — the base image is already on
          // screen and stays there. Cleared so a later pass can try again.
          asked.current.delete(id)
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, wantScale, cycleId])

  // ── zoom, anchored so the page does not run away ──────────────────────
  const zoomAround = useCallback(
    (next: number, anchorX?: number, anchorY?: number) => {
      const el = scrollRef.current
      const applied = clampZoom(next)
      if (!el) {
        setZoom(applied)
        return
      }
      // The default anchor is the middle of what you are looking at, so the
      // line being read stays put. Ctrl-scroll passes the pointer instead.
      const ax = anchorX ?? el.clientWidth / 2
      const ay = anchorY ?? el.clientHeight / 2
      const ratio = applied / zoom
      const left = (el.scrollLeft + ax) * ratio - ax
      const top = (el.scrollTop + ay) * ratio - ay
      setZoom(applied)
      // After the new width has been laid out, or the scroll clamps against
      // the old, smaller scrollWidth.
      requestAnimationFrame(() => {
        el.scrollLeft = left
        el.scrollTop = top
      })
    },
    [zoom],
  )

  const fitWidth = useCallback(() => zoomAround(1), [zoomAround])
  const fitPage = useCallback(() => {
    if (!pane.h || !baseW) return
    // The page, not the page plus its caption and the gap under it.
    const room = pane.h - GUTTER - 26
    zoomAround(clampZoom(room / (baseW * RATIO)))
  }, [pane.h, baseW, zoomAround])

  // Ctrl/Cmd + wheel, bound to the element with passive:false. React's onWheel
  // is passive, and preventDefault is the only thing stopping the browser from
  // zooming the whole page instead of this one.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const box = el.getBoundingClientRect()
      zoomAround(
        clampZoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)),
        e.clientX - box.left,
        e.clientY - box.top,
      )
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [zoom, zoomAround])

  useEffect(() => {
    // On the window, not on a wrapper div. The click that opens the preview
    // leaves focus on a button inside the rail that then unmounts, so focus
    // falls back to the body and a handler on any element in here never sees
    // the key.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onExit()
        return
      }
      if (!e.metaKey && !e.ctrlKey) return
      // Deliberately takes the browser's own zoom keys, and only while this
      // panel is mounted.
      if (e.key === "=" || e.key === "+") {
        e.preventDefault()
        zoomAround(stepZoom(zoom, 1))
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault()
        zoomAround(stepZoom(zoom, -1))
      } else if (e.key === "0") {
        e.preventDefault()
        fitWidth()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onExit, zoom, zoomAround, fitWidth])

  const retry = (key: string) => {
    evict(key)
    setFailed((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setRunning(true)
    setAttempt((n) => n + 1)
  }

  const here = pages.find((p) => visible.includes(p.key))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-900">
            The report as pages
          </h2>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {here
              ? `${here.caption} · ${pages.indexOf(here) + 1} of ${pages.length}`
              : "Every page you have chosen a template for, in order."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {running && (
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Rendering {done} of {chosen.length}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => abort.current?.abort()}
              >
                <X className="mr-1 h-3 w-3" />
                Stop
              </Button>
            </div>
          )}
          <PreviewZoomBar
            zoom={zoom}
            onZoom={(z) => zoomAround(z)}
            onFitWidth={fitWidth}
            onFitPage={fitPage}
          />
          <div className="h-5 w-px bg-slate-200" />
          <Button variant="outline" size="sm" className="h-8" onClick={onExit}>
            Back to designing
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-slate-100 p-5">
        <div
          className="mx-auto space-y-6"
          style={{ width: pageW || undefined }}
          onDoubleClick={() => zoomAround(zoom > 1.5 ? 1 : 2)}
        >
          {pages.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-500">
              Nothing to preview yet.
            </p>
          )}
          {pages.map((page) => {
            // Read the cache DURING render, the way PageRenderPanel does. The
            // pre-warm has usually drawn every section page already, and
            // without this they would all sit behind the cover and the
            // contents page — the two slowest entries, and the first two in
            // the queue — showing spinners for pictures already in memory.
            const base =
              urls[page.key] ?? (page.templateKey ? peek(page.key) : undefined)
            // The sharp copy replaces the soft one in place when it lands: no
            // spinner, no flash, no reflow. The page simply gets crisp.
            const sheets = sharp[`${page.key}|s${wantScale}`] ?? base
            return (
              <figure
                key={page.key}
                data-page-key={page.key}
                ref={(el) => {
                  if (el) figures.current.set(page.key, el)
                  else figures.current.delete(page.key)
                }}
                className="m-0"
              >
                <figcaption className="mb-1.5 truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {page.caption}
                </figcaption>
                {!page.templateKey ? (
                  <div
                    className="flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-sm text-slate-400"
                    style={{ height: pageH || 260 }}
                  >
                    {page.missing}
                  </div>
                ) : sheets ? (
                  <div className="space-y-3">
                    {sheets.map((sheet, i) => (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        key={i}
                        src={sheet}
                        alt={`${page.caption}, sheet ${i + 1}`}
                        // A sharp sheet is a multi-megabyte data URI that
                        // decodes to tens of MB. Async keeps that decode off
                        // the scroll path; nothing about what is shown moves.
                        decoding="async"
                        className="block w-full rounded-lg border border-slate-200 bg-white shadow-sm"
                      />
                    ))}
                  </div>
                ) : failed[page.key] ? (
                  <div
                    className="flex flex-col items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 text-sm"
                    style={{ height: pageH || 260 }}
                  >
                    <p className="px-6 text-center text-[12px] text-amber-900">
                      {failed[page.key]}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => retry(page.key)}
                    >
                      <RefreshCw className="mr-1.5 h-3 w-3" />
                      Try again
                    </Button>
                  </div>
                ) : (
                  // Height reserved from the A4 ratio, so the run does not
                  // jump as pages land — the old fixed 360px did.
                  <div
                    className="flex items-center justify-center rounded-lg border border-slate-200 bg-white"
                    style={{ height: pageH || 360 }}
                  >
                    <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                  </div>
                )}
              </figure>
            )
          })}
        </div>
      </div>
    </div>
  )
}
