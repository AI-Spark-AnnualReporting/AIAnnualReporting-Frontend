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
 */

import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { readError, type MutationError } from "@/hooks/useReportBuilder"
import type { DesignOption, DesignUnit } from "@/lib/api/createDesign"
import { renderSectionPages } from "@/lib/api/sectionBlocks"
import { cacheKey, evict, getOrRender, peek } from "@/lib/createDesignCache"
import { losesContent, lossText, placementText } from "@/lib/createDesignLoss"

import { TEMPLATE_NAMES } from "./TemplateMini"

// True A4 in CSS px. Used only for the aspect ratio: the panel reserves the
// SCALED height so it never jumps between renders.
const PAGE_W = 595
const PAGE_H = 842

export function PageRenderPanel({
  cycleId,
  sectionCode,
  sectionTitle,
  unit,
  templateKey,
  option,
  onChoose,
  choosing,
}: {
  cycleId: string
  sectionCode: string
  sectionTitle: string
  unit: DesignUnit
  templateKey: string | null
  option: DesignOption | null
  onChoose: (key: string) => void
  choosing: boolean
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  const [fetched, setFetched] = useState<{ key: string; pages: string[] } | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [page, setPage] = useState(0)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Read the cache during render, not in an effect: a page you have already
  // looked at must appear immediately, and routing it through state would
  // flash a spinner on every hit.
  const key = templateKey
    ? cacheKey(cycleId, sectionCode, unit.index, templateKey)
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
  }, [key, cached, cycleId, sectionTitle, unit, templateKey, attempt])

  // Clamp rather than reset, so flipping templates keeps you roughly where
  // you were in a multi-page unit.
  const total = pages?.length ?? 0
  const current = total ? Math.min(page, total - 1) : 0
  const height = width ? (PAGE_H / PAGE_W) * width : 0

  if (!templateKey) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-400">
        Pick a template on the left to see this page.
      </div>
    )
  }

  const chosen = unit.template_key === templateKey

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
            {placementText(option?.counts)}
          </p>
          {/* Loss is no longer a layout trade-off a person chooses between —
              every template holds everything — so this is a defect notice,
              not a caption, and it is styled like one. */}
          {option && losesContent(option.dropped) && (
            <p className="mt-0.5 text-[11px] font-semibold text-red-700">
              Content missing: {lossText(option.dropped, option.counts)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
        <div ref={wrapRef} className="mx-auto w-full max-w-[520px]">
          <div
            className="relative w-full overflow-hidden rounded-[6px] border border-slate-200 bg-white shadow-sm"
            style={{ height: height || undefined, minHeight: height ? undefined : 320 }}
          >
            {pages && pages[current] && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={pages[current]}
                alt={`${unit.title} as ${TEMPLATE_NAMES[templateKey] ?? templateKey}, sheet ${current + 1}`}
                className="block h-full w-full object-contain"
              />
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
