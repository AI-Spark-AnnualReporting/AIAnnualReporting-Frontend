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
 *
 * In landscape it offers the three landscape contents pages instead. The pick
 * is saved as the report's LANDSCAPE contents page, beside the portrait one,
 * so switching orientation never loses either. Until somebody picks, the
 * default (Brand panel) is the one in use.
 */

import { useQuery } from "@tanstack/react-query"
import { AlertTriangle, Check, Loader2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { annualDesignApi } from "@/lib/api/annual-design"
import {
  keyForFormat, LANDSCAPE_DESIGN_KEY, LANDSCAPE_TOC_NAMES,
  type LandscapeFormat, type Orientation,
} from "@/lib/orientation"
import { cn } from "@/lib/utils"
import type { TocDesign } from "@/types/report-design"

/**
 * Display names. The engine sends keys and prose; the noun is ours. The
 * landscape keys never collide with the portrait ones, so one map serves both.
 */
const NAMES: Record<string, string> = {
  classic: "Classic",
  editorial: "Editorial",
  modular: "Modular",
  minimal: "Minimal",
  brand_band: "Brand Band",
  ...LANDSCAPE_TOC_NAMES,
}

const title = (key: string) => NAMES[key] ?? key

/**
 * The designs the list offers: the portrait menu, or the landscape ones.
 * Empty in landscape when the engine is too old to send any.
 */
function designsToList(
  specs: { templates: TocDesign[]; landscape_templates?: TocDesign[] } | undefined,
  orientation: Orientation,
): TocDesign[] {
  if (orientation === "landscape") return specs?.landscape_templates ?? []
  return specs?.templates ?? []
}

export function TocDesignPanel({
  cycleId,
  chosen,
  locked,
  onChoose,
  saving,
  orientation = "portrait",
  format = "a4",
}: {
  cycleId: string
  /**
   * The contents design in use in the orientation on screen. Portrait: the
   * saved pick, or null when none. Landscape: the saved landscape pick, else
   * the default.
   */
  chosen: string | null
  locked: boolean
  /** Save a pick for the orientation on screen. */
  onChoose: (key: string) => void
  saving: boolean
  /** Portrait offers the five designs; landscape offers the three landscape ones. */
  orientation?: Orientation
  /** The landscape sheet the preview is drawn on: A4 or 16:9. */
  format?: LandscapeFormat
}) {
  const [active, setActive] = useState<string | null>(null)

  const catalogue = useQuery({
    queryKey: ["pm", "toc-designs"],
    queryFn: () => annualDesignApi.tocDesigns(),
    staleTime: Infinity, // static reference data owned by the engine
  })
  const landscape = orientation === "landscape"
  const designs = designsToList(catalogue.data, orientation)
  const fallbackKey = landscape
    ? LANDSCAPE_DESIGN_KEY
    : catalogue.data?.default ?? "classic"
  // An engine deployed before landscape existed sends no landscape design.
  // Asking it to draw "landscape" anyway would fail, or worse quietly draw a
  // portrait default, so the panel says so instead.
  const landscapeMissing = landscape && catalogue.isSuccess && designs.length === 0

  // What the right pane shows: the design being inspected, else the one in
  // use, else the default. Derived during render — this screen's lint rules
  // reject setState inside an effect, and a "which preview is loading" flag
  // kept by hand is exactly that. The parent remounts this panel when the
  // orientation flips, so a design inspected in one never shows in the other.
  const showing = active ?? chosen ?? fallbackKey
  const inUse = chosen
  // Landscape draws only a design the engine listed, so an engine from before
  // there was a choice is never asked for one it does not have.
  const canDraw = !landscape || designs.some((design) => design.key === showing)

  // One query per design, cached for the visit. React Query handles the
  // in-flight flag, the error and the memo that makes re-picking a design
  // already looked at free — which is the whole point of comparing five.
  const previewQuery = useQuery({
    // See CoverDesignPanel: the same key PreviewAllPanel reads.
    queryKey: ["pm", "cycle", cycleId, "toc-preview", keyForFormat(showing, format)],
    queryFn: () => annualDesignApi.previewToc(cycleId, showing),
    // Landscape waits for the list, so an old engine is never asked to draw a
    // design it does not have.
    enabled: Boolean(showing) && canDraw,
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
        {landscape ? (
          <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
            The table of contents of the landscape report. Every design prints
            every entry. Your portrait contents page is kept as it is.
          </p>
        ) : (
          <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
            How the table of contents is set. Every design prints every entry —
            they differ in how the levels are shown, never in what survives.
          </p>
        )}
        {landscapeMissing && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
            The export engine on this server does not have the landscape
            contents pages yet, so they cannot be previewed.
          </p>
        )}

        <div className="space-y-2">
          {designs.map((design) => {
            const isChosen = inUse === design.key
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
            disabled={locked || saving || chosen === showing || !canDraw}
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
                  // A sideways sheet gets more width, or its type would be
                  // drawn smaller than the portrait designs'.
                  className={cn(
                    "mx-auto w-full rounded border border-slate-300 bg-white shadow-sm",
                    landscape ? "max-w-4xl" : "max-w-2xl",
                  )}
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
