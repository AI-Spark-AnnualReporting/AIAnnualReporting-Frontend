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
 */

import { Loader2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { annualDesignApi } from "@/lib/api/annual-design"
import type { CycleDesign } from "@/lib/api/createDesign"
import { renderSectionPages } from "@/lib/api/sectionBlocks"
import { mapWithConcurrency } from "@/lib/concurrency"
import { cacheKey, getOrRender } from "@/lib/createDesignCache"

const CONCURRENCY = 2

interface Page {
  key: string
  caption: string
  /** What to say in the placeholder when nothing has been chosen. */
  missing: string
  templateKey: string | null
  render: () => Promise<string[]>
}

export function PreviewAllPanel({
  cycleId,
  design,
  coverKey,
  tocKey,
  active,
  onExit,
}: {
  cycleId: string
  design: CycleDesign | undefined
  coverKey: string | null
  tocKey: string | null
  active: boolean
  onExit: () => void
}) {
  // One entry per page unit, each holding every sheet that unit produced.
  const [urls, setUrls] = useState<Record<string, string[]>>({})
  const [done, setDone] = useState(0)
  const [running, setRunning] = useState(false)
  const abort = useRef<AbortController | null>(null)

  const pages: Page[] = [
    // The report's own front matter. Keyed in the same namespace as the
    // section units so one cache serves both, with codes no section can
    // collide with.
    {
      key: cacheKey(cycleId, "__cover__", 0, coverKey ?? "none"),
      caption: "Cover",
      missing: "No cover chosen",
      templateKey: coverKey,
      render: () =>
        annualDesignApi.previewCover(cycleId, coverKey as string).then((r) => r.pages),
    },
    {
      key: cacheKey(cycleId, "__contents__", 0, tocKey ?? "none"),
      caption: "Contents",
      missing: "No contents design chosen",
      templateKey: tocKey,
      render: () =>
        annualDesignApi.previewToc(cycleId, tocKey as string).then((r) => r.pages),
    },
  ]
  for (const section of [...(design?.sections ?? [])].sort((a, b) => a.order - b.order)) {
    for (const unit of section.design?.units ?? []) {
      pages.push({
        key: cacheKey(cycleId, section.section_code, unit.index, unit.template_key ?? "none"),
        caption:
          unit.total > 1
            ? `${section.title} · page ${unit.index} of ${unit.total}`
            : section.title,
        missing: "No template chosen",
        templateKey: unit.template_key,
        render: () =>
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
          }).then((r) => r.pages),
      })
    }
  }
  const chosen = pages.filter((p) => p.templateKey)

  useEffect(() => {
    if (!active) return
    const ac = new AbortController()
    abort.current = ac
    setDone(0)
    setRunning(true)

    void mapWithConcurrency(
      chosen,
      CONCURRENCY,
      async (page) => {
        const sheets = await getOrRender(page.key, page.render)
        setUrls((prev) => ({ ...prev, [page.key]: sheets }))
      },
      { signal: ac.signal, onSettled: (n) => setDone(n) },
    ).then(() => setRunning(false))

    return () => ac.abort()
    // chosen is derived from design; keying on the count is enough and keeps
    // this from re-running on every unrelated cache write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, chosen.length, cycleId])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-900">
            The report as pages
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Every page you have chosen a template for, in order.
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
          <Button variant="outline" size="sm" className="h-8" onClick={onExit}>
            Back to designing
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-5">
        {/* Wider than the dialog's 900px, but not unbounded: past about this
            the sheet is larger than the paper and reads worse, not better. */}
        <div className="mx-auto w-full max-w-[1100px] space-y-6">
          {pages.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-500">
              Nothing to preview yet.
            </p>
          )}
          {pages.map((page) => (
            <figure key={page.key} className="m-0">
              <figcaption className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {page.caption}
              </figcaption>
              {!page.templateKey ? (
                <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-sm text-slate-400">
                  {page.missing}
                </div>
              ) : urls[page.key] ? (
                <div className="space-y-3">
                  {urls[page.key].map((sheet, i) => (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      key={i}
                      src={sheet}
                      alt={`${page.caption}, sheet ${i + 1}`}
                      className="block w-full rounded-lg border border-slate-200 bg-white shadow-sm"
                    />
                  ))}
                </div>
              ) : (
                <div className="flex h-[360px] items-center justify-center rounded-lg border border-slate-200 bg-white">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                </div>
              )}
            </figure>
          ))}
        </div>
      </div>
    </div>
  )
}
