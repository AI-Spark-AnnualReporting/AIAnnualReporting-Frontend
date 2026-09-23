"use client"

/**
 * The page designer.
 *
 * Two panes, the same frame the Report Builder uses: sections on the left,
 * the templates for the selected page on the right. Clicking a card renders
 * that page for real; choosing one saves it.
 *
 * The extraction run is mounted from here rather than from the button that
 * leads here, so the screen can heal itself — see Design2ExtractRun.
 */

import { ArrowLeft, Code2, Layers, RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { PageLoader } from "@/components/ui/spinner"
import { useCycleDesign, useExtractSection, useSetTemplate } from "@/hooks/useDesign2"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { revokeSection } from "@/lib/design2Cache"

import { Design2ExtractRun } from "./Design2ExtractRun"
import { Design2Rail, type RailSelection } from "./Design2Rail"
import { PageRenderPanel } from "./PageRenderPanel"
import { PreviewAllDialog } from "./PreviewAllDialog"
import { TemplateCardGrid } from "./TemplateCardGrid"
import { UnitJsonPanel } from "./UnitJsonPanel"

export function Design2Shell({ cycleId }: { cycleId: string }) {
  const router = useRouter()
  const { data, isLoading, refetch } = useCycleDesign(cycleId)
  const setTemplate = useSetTemplate(cycleId)
  const extract = useExtractSection(cycleId)

  const [selected, setSelected] = useState<RailSelection | null>(null)
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  const [jsonOpen, setJsonOpen] = useState(false)
  const [previewAllOpen, setPreviewAllOpen] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)
  const [manualRun, setManualRun] = useState<{ force: boolean } | null>(null)
  const [failures, setFailures] = useState<Record<string, string>>({})
  // Set once the automatic run has had its go. Without it a section that
  // failed would keep `needsRun` true and restart the overlay forever.
  const [autoRunSettled, setAutoRunSettled] = useState(false)

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

  if (isLoading || !data) return <PageLoader />

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
  const effectivePreview = previewKey ?? unit?.template_key ?? unit?.options.find((o) => o.recommended)?.key ?? null
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
            Design2{cycleName ? ` — ${cycleName}` : ""}
          </h1>
          <p className="text-xs text-muted-foreground">
            {data.units_chosen} of {data.units_total} pages have a template
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
                    data.units_total ? (data.units_chosen / data.units_total) * 100 : 0
                  }%`,
                }}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <Design2Rail
              sections={data.sections}
              selected={active}
              onSelect={(next) => {
                setSelected(next)
                setPreviewKey(null)
              }}
              busyCode={extract.isPending ? extract.variables?.sectionCode : null}
              failed={failures}
              onReExtract={reExtract}
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
          {!section || !unit ? (
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
                  {unit.options.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      Recommendation unavailable for this page — every template is
                      still selectable.
                    </p>
                  ) : (
                    <TemplateCardGrid
                      options={unit.options}
                      previewKey={effectivePreview}
                      chosenKey={unit.template_key}
                      onPreview={setPreviewKey}
                      disabled={setTemplate.isPending}
                    />
                  )}
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
        <Design2ExtractRun
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
