"use client"

/**
 * The contents-page picker: five designs, previewed against this report.
 *
 * A REPORT-level control living inside a screen otherwise made of per-page
 * ones, which is why it saves through PATCH /pm/cycles/{id}/design — where the
 * cover template and the typography already live — rather than through the
 * per-section create_design envelope. The contents page belongs to the
 * document, not to any section in it.
 *
 * Previews are rendered from the report's OWN sections, so what is compared is
 * this document's hierarchy in five treatments. They are fetched one design at
 * a time, on demand: each is a real Chromium render, and firing five at once
 * to fill a grid nobody has looked at yet would cost five browsers per visit.
 */

import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, Check, Loader2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { annualDesignApi } from "@/lib/api/annual-design"
import { cn } from "@/lib/utils"

/** Display names. The engine sends keys and prose; the noun is ours. */
const NAMES: Record<string, string> = {
  classic: "Classic",
  editorial: "Editorial",
  modular: "Modular",
  minimal: "Minimal",
  brand_band: "Brand Band",
}

const title = (key: string) => NAMES[key] ?? key

export function TocDesignPanel({
  cycleId,
  chosen,
  locked,
  onChoose,
  saving,
}: {
  cycleId: string
  chosen: string | null
  locked: boolean
  onChoose: (key: string) => void
  saving: boolean
}) {
  const [active, setActive] = useState<string | null>(null)

  const catalogue = useQuery({
    queryKey: ["pm", "toc-designs"],
    queryFn: () => annualDesignApi.tocDesigns(),
    staleTime: Infinity, // static reference data owned by the engine
  })
  const designs = catalogue.data?.templates ?? []
  const fallbackKey = catalogue.data?.default ?? "classic"

  // What the right pane shows: the design being inspected, else the one saved,
  // else the engine's default. Derived during render — this screen's lint
  // rules reject setState inside an effect, and a "which preview is loading"
  // flag kept by hand is exactly that.
  const showing = active ?? chosen ?? fallbackKey

  // One query per design, cached for the visit. React Query handles the
  // in-flight flag, the error and the memo that makes re-picking a design
  // already looked at free — which is the whole point of comparing five.
  const previewQuery = useQuery({
    queryKey: ["pm", "cycle", cycleId, "toc-preview", showing],
    queryFn: () => annualDesignApi.previewToc(cycleId, showing),
    enabled: Boolean(showing),
    staleTime: Infinity,
    retry: false,
  })
  const preview = previewQuery.data
  const busy = previewQuery.isFetching ? showing : null
  const previewError = previewQuery.isError
    ? "This design could not be drawn. The report may not be assembled yet."
    : null
  const loadError = catalogue.isError
    ? "The export engine could not list the designs."
    : null

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="max-w-sm text-sm text-red-700">{loadError}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="w-[300px] shrink-0 overflow-y-auto border-r p-4">
        <p className="mb-1 text-xs font-semibold text-slate-900">Contents page</p>
        <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
          How the table of contents is set. Every design prints every entry —
          they differ in how the levels are shown, never in what survives.
        </p>

        <div className="space-y-2">
          {designs.map((design) => {
            const isChosen = chosen === design.key
            const isShowing = showing === design.key
            return (
              <button
                key={design.key}
                type="button"
                onClick={() => setActive(design.key)}
                className={cn(
                  "w-full rounded-lg border p-2.5 text-left transition",
                  isShowing
                    ? "border-indigo-400 bg-indigo-50/60"
                    : "border-slate-200 hover:border-slate-300",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900">
                    {title(design.key)}
                  </span>
                  {isChosen && (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                      <Check className="h-3 w-3" />
                      In use
                    </span>
                  )}
                  {busy === design.key && (
                    <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />
                  )}
                </div>
                <p className="mt-1 text-[10.5px] leading-snug text-slate-500">
                  {design.purpose}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-2.5">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900">{title(showing)}</p>
            {preview && (
              <p className="text-[11px] text-slate-500">
                {preview.entries} entries · {preview.depth} level
                {preview.depth === 1 ? "" : "s"} ·{" "}
                {preview.page_count === 1 ? "one sheet" : `${preview.page_count} sheets`}
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant={chosen === showing ? "outline" : "brand"}
            className="h-8 shrink-0"
            disabled={locked || saving || chosen === showing}
            title={
              locked
                ? "This report has been approved and locked."
                : undefined
            }
            onClick={() => onChoose(showing)}
          >
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {chosen === showing ? "In use" : "Use this design"}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-5">
          {previewError && (
            <div className="mx-auto mb-3 flex max-w-xl items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <p className="text-[11px] text-amber-900">{previewError}</p>
            </div>
          )}
          {!preview && busy && (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Drawing this design…
            </div>
          )}
          {preview && (
            <div className="space-y-4">
              {preview.pages.map((src, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={index}
                  src={src}
                  alt={`${title(showing)} contents page ${index + 1}`}
                  className="mx-auto w-full max-w-2xl rounded border border-slate-300 bg-white shadow-sm"
                />
              ))}
              {preview.estimated_pages && (
                // Said plainly rather than left to be discovered: resolving the
                // real folios means rendering every section, which is the
                // expensive half of a full export.
                <p className="pb-2 text-center text-[11px] text-slate-500">
                  Page numbers shown are illustrative. The exported report
                  carries the real ones.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
