"use client"

/**
 * The large rendered page beside the cards.
 *
 * Renders are cached per (section, page, template), so going back to a
 * template you already looked at costs nothing — which is what makes
 * comparing two of them feel like comparing rather than waiting.
 *
 * A raw <img>: next/image is used nowhere in this app and next.config.ts has
 * no images config, so it would need a config change to load an object URL.
 */

import { Loader2, RefreshCw } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import type { DesignOption, DesignUnit } from "@/lib/api/design2"
import { renderSectionPageBlob } from "@/lib/api/designBlocks"
import { cacheKey, getOrRender, peek } from "@/lib/design2Cache"
import { losesContent, lossText, placedText } from "@/lib/design2Loss"

import { TEMPLATE_NAMES } from "./TemplateMini"

// True A4 in CSS px, matching PreviewFrame. Used only for the aspect ratio:
// the panel reserves the SCALED height so it never jumps between renders.
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
  // Keyed so a stale response for a template you have already clicked past
  // cannot paint over the current one.
  const [fetched, setFetched] = useState<{ key: string; url: string } | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const [attempt, setAttempt] = useState(0)

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
  const cached = key ? peek(key) : null
  const url = cached ?? (fetched && fetched.key === key ? fetched.url : null)
  // Both derived: keyed results mean "we have neither a picture nor a failure
  // for the template currently selected" is exactly what loading means, and
  // a stale failure cannot leak onto the next template.
  const error = failure && failure.key === key ? failure.message : null
  const loading = !!key && !url && !error

  useEffect(() => {
    if (!key || cached) return

    let alive = true
    getOrRender(key, () =>
      renderSectionPageBlob(cycleId, {
        blocks: unit.blocks,
        title: unit.title,
        eyebrow: sectionTitle,
        running_label: "Annual Report",
        template_key: templateKey ?? undefined,
      }),
    )
      .then((next) => {
        if (alive) setFetched({ key, url: next })
      })
      .catch((e) => {
        if (alive)
          setFailure({
            key,
            message: (e as Error)?.message || "The page could not be rendered.",
          })
      })
    return () => {
      alive = false
    }
  }, [key, cached, cycleId, sectionTitle, unit, templateKey, attempt])

  const height = width ? (PAGE_H / PAGE_W) * width : 0

  if (!templateKey) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-400">
        Pick a template on the left to see this page.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b px-5 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {TEMPLATE_NAMES[templateKey] ?? templateKey}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {placedText(option?.counts) || "Nothing placed"}
          </p>
          {option && losesContent(option.dropped) && (
            <p className="mt-0.5 truncate text-[11px] text-amber-700">
              {lossText(option.dropped, option.counts)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => setAttempt((a) => a + 1)}
            disabled={loading}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Re-render
          </Button>
          <Button
            size="sm"
            variant={unit.template_key === templateKey ? "outline" : "brand"}
            className="h-8"
            onClick={() => onChoose(templateKey)}
            disabled={choosing || unit.template_key === templateKey}
          >
            {choosing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            {unit.template_key === templateKey ? "Selected" : "Use this template"}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-5">
        <div ref={wrapRef} className="mx-auto w-full max-w-[520px]">
          <div
            className="relative w-full overflow-hidden rounded-[6px] border border-slate-200 bg-white shadow-sm"
            style={{ height: height || undefined, minHeight: height ? undefined : 320 }}
          >
            {url && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={url}
                alt={`${unit.title} as ${TEMPLATE_NAMES[templateKey] ?? templateKey}`}
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
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-red-700">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
