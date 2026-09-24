"use client"

/**
 * The page designer.
 *
 * Two panes, the same frame the Report Builder uses: sections on the left,
 * the templates for the selected page on the right. Clicking a card renders
 * that page for real; choosing one saves it.
 *
 * The extraction run is mounted from here rather than from the button that
 * leads here, so the screen can heal itself — see CreateDesignExtractRun.
 */

import { ArrowLeft, Code2, Layers, RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { PageLoader } from "@/components/ui/spinner"
import { useCycleDesign, useExtractSection, useSetTemplate } from "@/hooks/useCreateDesign"
import { useDesignPrewarm } from "@/hooks/useDesignPrewarm"
import { readError, type MutationError } from "@/hooks/useReportBuilder"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { annualDesignApi } from "@/lib/api/annual-design"
import { revokeSection } from "@/lib/createDesignCache"

import { CreateDesignExtractRun } from "./CreateDesignExtractRun"
import { CreateDesignRail, type RailSelection } from "./CreateDesignRail"
import { PageRenderPanel } from "./PageRenderPanel"
import { PreviewAllDialog } from "./PreviewAllDialog"
import { TemplateCardGrid } from "./TemplateCardGrid"
import { TocDesignPanel } from "./TocDesignPanel"
import { UnitJsonPanel } from "./UnitJsonPanel"

// Mirrors the engine's template list. Used only when the per-page
// recommendation lookup failed, so the column still offers every choice.
const FALLBACK_OPTIONS = [
  "narrative_text_heavy",
  "narrative_with_stats",
  "kpi_stat_grid",
  "financial_table",
  "statement_letter",
].map((key) => ({
  key,
  recommended: false,
  reason: null,
  counts: {},
  dropped: {},
}))

export function CreateDesignShell({ cycleId }: { cycleId: string }) {
  const router = useRouter()
  const { data, isLoading, error, refetch } = useCycleDesign(cycleId)
  const setTemplate = useSetTemplate(cycleId)
  const extract = useExtractSection(cycleId)

  const [selected, setSelected] = useState<RailSelection | null>(null)
  // The contents page is a REPORT-level choice, so it gets its own bit of
  // state rather than a sentinel section code threaded through every lookup
  // below — a fake code would have to be excluded from the rail, the counts,
  // the extract run and the preview, and each of those is a place to forget.
  const [tocOpen, setTocOpen] = useState(false)
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  const [jsonOpen, setJsonOpen] = useState(false)
  const [previewAllOpen, setPreviewAllOpen] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)
  const [manualRun, setManualRun] = useState<{ force: boolean } | null>(null)
  const [failures, setFailures] = useState<Record<string, string>>({})
  // Set once the automatic run has had its go. Without it a section that
  // failed would keep `needsRun` true and restart the overlay forever.
  const [autoRunSettled, setAutoRunSettled] = useState(false)

  // The report-level design record, for the contents picker. Separate from
  // useCycleDesign, which is the per-SECTION envelope — these are different
  // records in different tables and conflating them is how the contents choice
  // would end up stored per page.
  const qc = useQueryClient()
  const designKey = ["pm", "cycle", cycleId, "report-design"]
  const reportDesign = useQuery({
    queryKey: designKey,
    queryFn: () => annualDesignApi.get(cycleId),
  })
  const saveToc = useMutation({
    mutationFn: (key: string) =>
      annualDesignApi.save(cycleId, { toc_template_key: key }),
    onSuccess: (fresh) => qc.setQueryData(designKey, fresh),
  })

  const { data: pmData } = usePMCycleDashboard(cycleId)
  const cycleName = (pmData as { cycle?: { cycle_name?: string } } | undefined)?.cycle
    ?.cycle_name

  // Full width, like the report page. Cleans up on unmount.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("sidebar-set-mode", { detail: { mode: "hidden" } }))
    return () => {
      window.dispatchEvent(
        new CustomEvent("sidebar-set-mode", { detail: { mode: "expanded" } }),
      )
    }
  }, [])

  // Anything eligible that has never been structured, or whose content moved
  // since it was, needs a run before the screen is worth looking at.
  const needsRun = useMemo(
    () => (data?.sections ?? []).some((s) => s.eligible && (!s.extracted || s.stale)),
    [data],
  )

  // Derived during render rather than set from an effect: the overlay is a
  // function of "is there unstructured work", so it unmounts on its own once
  // the run has done it.
  const run =
    manualRun ?? (!isLoading && needsRun && !autoRunSettled ? { force: false } : null)

  // Draw every section's page in the background, so clicking one is instant.
  // Mounted here, above the early returns, because hooks cannot sit after a
  // conditional return — and fed `selected` rather than the derived `active`
  // for the same reason. That is no loss: `selected` is the section a person
  // actually clicked, which is exactly what should jump the queue.
  //
  // Held off while the extract overlay is up. Pre-warming underneath it would
  // put render requests in front of the model calls that overlay is waiting
  // on, making the wait people already see longer.
  useDesignPrewarm(cycleId, data?.sections, selected?.code ?? null, !run)

  if (isLoading && !data) return <PageLoader />

  // React Query keeps serving the last good payload after a failure, which
  // made a session that had lost access look like a working screen with an
  // unexplained red toast. Say so instead.
  if (error) {
    return (
      <div className="flex h-[calc(100vh-8.5rem)] flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="max-w-md text-sm text-red-700">
          {readError(error as MutationError, "This cycle could not be loaded.")}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/pm/cycles/${cycleId}/report`)}
          >
            Back to the report
          </Button>
        </div>
      </div>
    )
  }

  if (!data) return <PageLoader />

  // Derived during render, not in an effect, so the first selection never
  // costs a second pass.
  const eligible = [...data.sections].filter((s) => s.eligible).sort((a, b) => a.order - b.order)
  const fallback: RailSelection | null = eligible.length
    ? { code: eligible[0].section_code, unit: eligible[0].design?.units[0]?.index ?? 1 }
    : null
  const active = selected ?? fallback

  const section = active
    ? data.sections.find((s) => s.section_code === active.code) ?? null
    : null
  const unit = section?.design?.units.find((u) => u.index === active?.unit) ?? null
  const effectivePreview =
    previewKey ??
    unit?.template_key ??
    unit?.options.find((o) => o.recommended)?.key ??
    (unit ? FALLBACK_OPTIONS[0].key : null)
  const option = unit?.options.find((o) => o.key === effectivePreview) ?? null

  const reExtract = (sectionCode: string) => {
    revokeSection(cycleId, sectionCode)
    extract.mutate({ sectionCode, force: true })
  }

  return (
    <div className="-m-8 flex h-[calc(100vh-72px)] flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b bg-card px-5 py-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          aria-label="Go back"
          onClick={() => router.push(`/pm/cycles/${cycleId}/report`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">
            Create Design{cycleName ? ` — ${cycleName}` : ""}
          </h1>
          <p className="text-xs text-muted-foreground">
            {/* "sections", not "pages". A section is designed once and the
                renderer flows it onto however many sheets it needs, so the
                only count that means anything here is sections — calling them
                pages invited a comparison with the sheet counter on the right,
                which counts something else entirely. */}
            {data.units_chosen === data.units_total && data.units_total > 0
              ? `All ${data.units_total} sections laid out · ${data.units_reviewed} reviewed`
              : `${data.units_chosen} of ${data.units_total} sections have a design`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => setConfirmAll(true)}
          disabled={extract.isPending}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Re-extract all
        </Button>
        <Button
          size="sm"
          variant="brand"
          className="h-8"
          onClick={() => setPreviewAllOpen(true)}
          disabled={data.units_chosen === 0}
          title={
            data.units_chosen === 0
              ? "Choose a template for at least one page first"
              : "Renders every chosen page — about a second each"
          }
        >
          <Layers className="mr-1.5 h-3.5 w-3.5" />
          Preview all pages
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-[360px] shrink-0 flex-col overflow-hidden border-r bg-white">
          <div className="shrink-0 border-b px-5 py-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all"
                style={{
                  width: `${
                    data.units_total ? (data.units_reviewed / data.units_total) * 100 : 0
                  }%`,
                }}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <CreateDesignRail
              sections={data.sections}
              selected={tocOpen ? null : active}
              onSelect={(next) => {
                setTocOpen(false)
                setSelected(next)
                setPreviewKey(null)
              }}
              busyCode={extract.isPending ? extract.variables?.sectionCode : null}
              failed={failures}
              onReExtract={reExtract}
              tocActive={tocOpen}
              tocDesign={reportDesign.data?.toc_template_key ?? null}
              onSelectToc={() => setTocOpen(true)}
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
          {tocOpen ? (
            <TocDesignPanel
              cycleId={cycleId}
              chosen={reportDesign.data?.toc_template_key ?? null}
              locked={reportDesign.data?.locked ?? false}
              saving={saveToc.isPending}
              onChoose={(key) => saveToc.mutate(key)}
            />
          ) : !section || !unit ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-slate-400">
              {eligible.length
                ? "Pick a section on the left."
                : "No section in this report has prose to lay out yet."}
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-slate-900">
                    {section.title}
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {unit.total > 1 ? `Page ${unit.index} of ${unit.total} · ` : ""}
                    {unit.title}
                  </p>
                  {/* The art director's own sentence, written for whoever is
                      reviewing the page. It replaces the rules classifier's
                      "16 figures, only 412 chars of prose", which explained
                      the rule rather than the judgement. */}
                  {section.plan?.why && (
                    <p className="mt-1 text-[11px] italic text-indigo-700">
                      {section.plan.why}
                      {unit.template_auto && " — laid out for you; pick another below to change it."}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={() => setJsonOpen(true)}
                  >
                    <Code2 className="mr-1.5 h-3.5 w-3.5" />
                    View JSON
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={() => reExtract(section.section_code)}
                    disabled={extract.isPending}
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Re-extract
                  </Button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1">
                <div className="w-[420px] shrink-0 overflow-y-auto border-r p-4">
                  {unit.options.length === 0 && (
                    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                      <p className="text-[11px] text-amber-900">
                        Couldn&apos;t work out which template suits this page, so
                        none is recommended — every one is still selectable below.
                      </p>
                      {unit.options_error && (
                        <p className="mt-1 font-mono text-[10.5px] text-amber-700">
                          {unit.options_error}
                        </p>
                      )}
                    </div>
                  )}
                  {/* Never an empty column: when the recommendation lookup
                      failed, offer every template as a plain card rather than
                      a sentence saying they are selectable and nothing to
                      click. */}
                  <TemplateCardGrid
                    options={
                      unit.options.length > 0 ? unit.options : FALLBACK_OPTIONS
                    }
                    previewKey={effectivePreview}
                    chosenKey={unit.template_key}
                    onPreview={setPreviewKey}
                    disabled={setTemplate.isPending}
                  />
                </div>
                <div className="min-h-0 flex-1">
                  <PageRenderPanel
                    cycleId={cycleId}
                    sectionCode={section.section_code}
                    sectionTitle={section.title}
                    unit={unit}
                    templateKey={effectivePreview}
                    option={option}
                    choosing={setTemplate.isPending}
                    onChoose={(key) =>
                      setTemplate.mutate({
                        sectionCode: section.section_code,
                        unitIndex: unit.index,
                        templateKey: key,
                      })
                    }
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <UnitJsonPanel unit={unit} open={jsonOpen} onOpenChange={setJsonOpen} />
      <PreviewAllDialog
        cycleId={cycleId}
        design={data}
        open={previewAllOpen}
        onOpenChange={setPreviewAllOpen}
      />
      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title="Re-extract every section?"
        description="Every section's pages will be rebuilt with GPT-4.1 — roughly one model call per page. Template choices for pages that change will be cleared."
        confirmLabel="Re-extract all"
        onConfirm={() => {
          setConfirmAll(false)
          setManualRun({ force: true })
        }}
      />

      {run && (
        <CreateDesignExtractRun
          cycleId={cycleId}
          sections={data.sections}
          force={run.force}
          onDone={(f) => {
            setFailures(f)
            setManualRun(null)
            setAutoRunSettled(true)
            void refetch()
          }}
        />
      )}
    </div>
  )
}
