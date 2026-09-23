"use client"

/**
 * The whole report as a run of pages.
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
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import type { CycleDesign } from "@/lib/api/design2"
import { renderSectionPages } from "@/lib/api/designBlocks"
import { mapWithConcurrency } from "@/lib/concurrency"
import { cacheKey, getOrRender } from "@/lib/design2Cache"

const CONCURRENCY = 2

interface Page {
  key: string
  caption: string
  sectionCode: string
  unitIndex: number
  templateKey: string | null
  render: () => Promise<string[]>
}

export function PreviewAllDialog({
  cycleId,
  design,
  open,
  onOpenChange,
}: {
  cycleId: string
  design: CycleDesign | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  // One entry per page unit, each holding every sheet that unit produced.
  const [urls, setUrls] = useState<Record<string, string[]>>({})
  const [done, setDone] = useState(0)
  const [running, setRunning] = useState(false)
  const abort = useRef<AbortController | null>(null)

  const pages: Page[] = []
  for (const section of [...(design?.sections ?? [])].sort((a, b) => a.order - b.order)) {
    for (const unit of section.design?.units ?? []) {
      pages.push({
        key: cacheKey(cycleId, section.section_code, unit.index, unit.template_key ?? "none"),
        caption:
          unit.total > 1
            ? `${section.title} · page ${unit.index} of ${unit.total}`
            : section.title,
        sectionCode: section.section_code,
        unitIndex: unit.index,
        templateKey: unit.template_key,
        render: () =>
          renderSectionPages(cycleId, {
            blocks: unit.blocks,
            title: unit.title,
            eyebrow: section.title,
            running_label: "Annual Report",
            template_key: unit.template_key ?? undefined,
          }).then((r) => r.pages),
      })
    }
  }
  const chosen = pages.filter((p) => p.templateKey)

  useEffect(() => {
    if (!open) return
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
  }, [open, chosen.length, cycleId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-[900px] flex-col overflow-hidden">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>The report as pages</DialogTitle>
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
          </div>
          <DialogDescription>
            Every page you have chosen a template for, in order.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto bg-slate-100 p-5">
          {pages.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-500">
              Nothing to preview yet.
            </p>
          )}
          {pages.map((page) => (
            <figure key={`${page.sectionCode}-${page.unitIndex}`} className="m-0">
              <figcaption className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {page.caption}
              </figcaption>
              {!page.templateKey ? (
                <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-sm text-slate-400">
                  No template chosen
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
      </DialogContent>
    </Dialog>
  )
}
