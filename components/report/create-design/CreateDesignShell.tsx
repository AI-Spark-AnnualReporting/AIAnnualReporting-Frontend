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
 *
 * The Portrait | Landscape switch in the header decides which of a page's two
 * picks everything below reads. Portrait is the screen as it always was;
 * landscape offers the three landscape templates, never auto-picks, and shows
 * a card for a page with no landscape pick (it prints in the plain layout).
 * The cover and contents page have a landscape pick of their own too, saved
 * beside the portrait one.
 */

import {
  ArrowLeft, Code2, Layers, ListChecks, Loader2, Palette, PanelLeftClose, PanelLeftOpen,
  RefreshCw,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { PageLoader } from "@/components/ui/spinner"
import {
  useApplyLandscapeToAll, useCycleDesign, useExtractSection, useRecheckCustomTemplate,
  useSetTemplate,
} from "@/hooks/useCreateDesign"
import { useDesignPrewarm } from "@/hooks/useDesignPrewarm"
import { readError, type MutationError } from "@/hooks/useReportBuilder"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { annualDesignApi } from "@/lib/api/annual-design"
import { isAuthError } from "@/lib/api/client"
import type {
  CustomTemplateStatus, CycleDesign, DesignOption, DesignUnit,
} from "@/lib/api/createDesign"
import { cacheKey, peek, revokeCycle, revokeSection } from "@/lib/createDesignCache"
import {
  CUSTOM_TEMPLATE_KEY, SHOW_CUSTOM_TEMPLATES, customTemplateFor, paperFor, renderTemplateTag,
} from "@/lib/customTemplate"
import {
  countPicked, LANDSCAPE_TEMPLATE_SHORT_NAMES, landscapeCoverKey, landscapeKeyToApply,
  landscapeOpenerChoice, landscapeOptions, landscapeTocKey, orientationOf, pageFormatOf, pickedKey,
  portraitOpenerChoice, selectionForPageFormat, type LandscapeFormat, type Orientation,
  type PageFormat,
} from "@/lib/orientation"
import {
  DesignDialog, DESIGN_CATALOGUE_KEY, reportDesignKey, type CustomizeTab,
} from "@/components/report/design/DesignDialog"
import type { DesignSelection } from "@/types/report-design"

import { CreateDesignExtractRun } from "./CreateDesignExtractRun"
import { CreateDesignRail, type RailSelection } from "./CreateDesignRail"
import { CustomTemplatePanel } from "./CustomTemplatePanel"
import { OrientationToggle } from "./OrientationToggle"
import { PageRenderPanel } from "./PageRenderPanel"
import { PreviewAllPanel } from "./PreviewAllPanel"
import { TemplateCardGrid } from "./TemplateCardGrid"
import { CoverDesignPanel } from "./CoverDesignPanel"
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
  "executive_statement",
  "editorial_alternating",
  "editorial_movements",
  "editorial_columns",
  "statement_stat_rail",
  "stat_tiles",
  "data_tables",
].map((key) => ({
  key,
  recommended: false,
  reason: null,
  counts: {},
  dropped: {},
}))

/**
 * A section's saved cards plus any template it does not list.
 *
 * The options are stored when a section is extracted, so a section laid out
 * before a template existed never offers it — Chairman's Statement showed five
 * cards after Executive statement and Editorial were added. The missing ones
 * are appended without counts (those need a re-extract); clicking one still
 * draws the real page.
 */
function withEveryTemplate(options: DesignOption[]): DesignOption[] {
  const listed = new Set(options.map((option) => option.key))
  const missing = FALLBACK_OPTIONS.filter((option) => !listed.has(option.key))
  return [...options, ...missing]
}

/** The toast after a custom template is saved: how many of the PM's wishes it met. */
function customDoneMessage(status: CustomTemplateStatus): string {
  // The panel also follows an adjustment that was going when it opened.
  if (status.kind === "adjust") return "Template adjusted. It's now used for this section."
  const total = status.wishes_total ?? 0
  const met = status.wishes_met ?? 0
  if (!total) return "Custom template ready. It's now used for this section."
  if (met >= total) return `Custom template ready: all ${total} of your wishes are met.`
  return `Custom template ready: ${met} of ${total} wishes met. The page lists what it couldn't do.`
}

/** The card for the page's own custom template. It holds everything by design. */
const CUSTOM_OPTION: DesignOption = {
  key: CUSTOM_TEMPLATE_KEY,
  recommended: false,
  reason: null,
  counts: {},
  dropped: {},
}

/**
 * The cards the template column offers for a page in one orientation.
 *
 * The page's custom template comes first when it has one for the sheet on
 * screen — it was made for this section, so it is the most specific choice.
 */
function cardsFor(
  unit: DesignUnit,
  orientation: Orientation,
  format: LandscapeFormat,
): DesignOption[] {
  const fixed = orientation === "landscape" ? landscapeOptions() : withEveryTemplate(unit.options)
  if (!SHOW_CUSTOM_TEMPLATES) return fixed
  return customTemplateFor(unit, orientation, format) ? [CUSTOM_OPTION, ...fixed] : fixed
}

/**
 * The template the right-hand panel draws for a page.
 *
 * Portrait: the card being looked at, else the pick, else the art director's
 * recommendation, else the first template — as it always was. Landscape: the
 * card being looked at, else the landscape pick, and nothing else. Falling
 * back to a portrait key or a recommendation would draw a page the landscape
 * export will never print; null shows the "no landscape template" card.
 *
 * @returns a template key, or null when there is nothing to draw
 */
function templateToShow(
  unit: DesignUnit | null,
  previewKey: string | null,
  orientation: Orientation,
  format: LandscapeFormat,
): string | null {
  if (orientation === "landscape") {
    const picked = unit?.landscape_template_key ?? null
    // A custom layout made for the other landscape sheet does not print on
    // this one, so it is not the page to draw. While custom templates are
    // hidden, a saved custom pick is not drawn either.
    const hidden = picked === CUSTOM_TEMPLATE_KEY && !SHOW_CUSTOM_TEMPLATES
    const usable = (picked === CUSTOM_TEMPLATE_KEY && !customTemplateFor(unit, orientation, format)) || hidden
      ? null
      : picked
    return previewKey ?? usable
  }
  // While custom templates are hidden, a saved custom pick falls through to
  // the recommendation like a page with no pick.
  const portraitPick = unit?.template_key === CUSTOM_TEMPLATE_KEY && !SHOW_CUSTOM_TEMPLATES
    ? null
    : unit?.template_key
  return (
    previewKey ??
    portraitPick ??
    unit?.options.find((o) => o.recommended)?.key ??
    (unit ? FALLBACK_OPTIONS[0].key : null)
  )
}

/** The card behind the template being drawn, for its counts and losses. */
function optionFor(
  unit: DesignUnit | null,
  templateKey: string | null,
  orientation: Orientation,
): DesignOption | null {
  if (!unit) return null
  if (templateKey === CUSTOM_TEMPLATE_KEY) return CUSTOM_OPTION
  const options = orientation === "landscape" ? landscapeOptions() : unit.options
  return options.find((o) => o.key === templateKey) ?? null
}

/** The line under the screen title: how many sections have a design. */
function designCountText(data: CycleDesign, orientation: Orientation): string {
  if (orientation === "landscape") {
    const { picked, total } = countPicked(data.sections, "landscape")
    if (picked === total && total > 0) return `All ${total} sections have a landscape design`
    return `${picked} of ${total} sections have a landscape design`
  }
  if (data.units_chosen === data.units_total && data.units_total > 0) {
    return `All ${data.units_total} sections laid out · ${data.units_reviewed} reviewed`
  }
  return `${data.units_chosen} of ${data.units_total} sections have a design`
}

/**
 * How full the rail's progress bar is, 0 to 100.
 *
 * Portrait measures pages a person has reviewed. Landscape measures pages
 * with a landscape pick: there is no art director there, so a pick IS the
 * review.
 */
function progressPercent(data: CycleDesign, orientation: Orientation): number {
  if (orientation === "landscape") {
    const { picked, total } = countPicked(data.sections, "landscape")
    return total ? (picked / total) * 100 : 0
  }
  return data.units_total ? (data.units_reviewed / data.units_total) * 100 : 0
}

/** The rail Preview button's tooltip. */
function previewButtonTitle(orientation: Orientation, unitsChosen: number): string {
  if (orientation === "landscape") {
    return "Renders the landscape cover, contents and every page with a landscape template — about a second each"
  }
  if (unitsChosen === 0) return "Choose a template for at least one page first"
  return "Renders every chosen page — about a second each"
}

/** The toast after "Use for all sections", naming the template applied. */
function landscapeAppliedText(applied: number, templateName: string): string {
  if (applied === 0) return "Every section already has a landscape template"
  if (applied === 1) return `${templateName} applied to 1 section`
  return `${templateName} applied to ${applied} sections`
}

export function CreateDesignShell({ cycleId }: { cycleId: string }) {
  const router = useRouter()
  const { data, isLoading, isFetching, error, refetch } = useCycleDesign(cycleId)
  const setTemplate = useSetTemplate(cycleId)
  const applyLandscape = useApplyLandscapeToAll(cycleId)
  const extract = useExtractSection(cycleId)
  const recheckCustom = useRecheckCustomTemplate(cycleId)

  const [selected, setSelected] = useState<RailSelection | null>(null)
  // The contents page is a REPORT-level choice, so it gets its own bit of
  // state rather than a sentinel section code threaded through every lookup
  // below — a fake code would have to be excluded from the rail, the counts,
  // the extract run and the preview, and each of those is a place to forget.
  const [tocOpen, setTocOpen] = useState(false)
  // The cover is a report-level choice too, and it also settles how every
  // section's opening page looks — so it sits above Contents in the rail.
  const [coverOpen, setCoverOpen] = useState(false)
  // The Customize dialog. Report-level like the cover and the contents page,
  // but a dialog rather than a rail entry: it restyles pages that are already
  // laid out instead of being one of the things laid out.
  const [colorsOpen, setColorsOpen] = useState(false)
  // Which of its tabs to open on. The header button goes to Brand; the rail's
  // Cover and Contents entries go straight to Pages, so what somebody clicked
  // for is the thing in front of them.
  const [customizeTab, setCustomizeTab] = useState<CustomizeTab>("brand")
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  // The "create a custom template" panel, in place of the page on the right.
  const [customOpen, setCustomOpen] = useState(false)
  const [jsonOpen, setJsonOpen] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  // Collapsed to a sliver so the preview gets the screen. Driven from the
  // handlers below rather than from an effect on previewMode: an effect would
  // re-collapse the rail on every render while preview is open, so the chevron
  // would appear to do nothing.
  const [railCollapsed, setRailCollapsed] = useState(false)
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
  // The same helper the Colours modal reads back, so the two cannot drift
  // apart into a cache miss that silently costs a round trip.
  const designKey = reportDesignKey(cycleId)
  const reportDesign = useQuery({
    queryKey: designKey,
    queryFn: () => annualDesignApi.get(cycleId),
  })
  // Cover templates and colour palettes are reference data — same for every
  // cycle, never invalidated. Fetched once here, in the quiet after the screen
  // has loaded, so opening Colours does not pay for it. Without this the modal
  // came up with an empty pill row and five dashed swatches for as long as the
  // round trip took, which read as broken rather than loading.
  useEffect(() => {
    void qc.prefetchQuery({
      queryKey: DESIGN_CATALOGUE_KEY,
      queryFn: () => annualDesignApi.catalogue(),
      staleTime: Infinity,
    })
  }, [qc])

  const saveCover = useMutation({
    mutationFn: (key: string) =>
      annualDesignApi.save(cycleId, { cover2_template_key: key }),
    onSuccess: (fresh) => qc.setQueryData(designKey, fresh),
  })
  const saveToc = useMutation({
    mutationFn: (key: string) =>
      annualDesignApi.save(cycleId, { toc_template_key: key }),
    onSuccess: (fresh) => qc.setQueryData(designKey, fresh),
  })
  // The landscape cover and contents page: saved in their own fields beside
  // the portrait ones, so each orientation keeps its own.
  const saveLandscapeCover = useMutation({
    mutationFn: (key: string) =>
      annualDesignApi.save(cycleId, { landscape_cover_template_key: key }),
    onSuccess: (fresh) => {
      qc.setQueryData(designKey, fresh)
      // The landscape cover decides which opener every landscape section
      // opens on, and no render cache key names the opener — so every section
      // page already drawn would keep the old one. See revokeCycle.
      revokeCycle(cycleId)
    },
    onError: (err: MutationError) =>
      toast.error(readError(err, "Could not save that cover")),
  })
  // The section opener chosen on its own (Split artwork), or "" to have it
  // follow the cover again. Revoked like the landscape cover: every section
  // page is drawn with its opener as sheet 1, and no render cache key names it.
  const saveLandscapeOpener = useMutation({
    mutationFn: (key: string | null) =>
      annualDesignApi.save(cycleId, { landscape_divider_template_key: key ?? "" }),
    onSuccess: (fresh) => {
      qc.setQueryData(designKey, fresh)
      revokeCycle(cycleId)
    },
    onError: (err: MutationError) =>
      toast.error(readError(err, "Could not save the section title pages")),
  })
  // The same choice for a portrait report, saved in the portrait field so each
  // orientation keeps its own. Revoked for the same reason: a portrait section
  // page is drawn with its opener as sheet 1 too, and no render cache key
  // names it.
  const savePortraitOpener = useMutation({
    mutationFn: (key: string | null) =>
      annualDesignApi.save(cycleId, { divider_template_key: key ?? "" }),
    onSuccess: (fresh) => {
      qc.setQueryData(designKey, fresh)
      revokeCycle(cycleId)
    },
    onError: (err: MutationError) =>
      toast.error(readError(err, "Could not save the section title pages")),
  })
  // No revoke: the contents page is drawn on its own, under its own key, and
  // no section page shows it.
  const saveLandscapeToc = useMutation({
    mutationFn: (key: string) =>
      annualDesignApi.save(cycleId, { landscape_toc_template_key: key }),
    onSuccess: (fresh) => qc.setQueryData(designKey, fresh),
    onError: (err: MutationError) =>
      toast.error(readError(err, "Could not save that contents page")),
  })
  // Report-level like the two above. Nothing to revoke afterwards: every
  // render cache key names its template, the two orientations never share a
  // template, and the two landscape sheets — which do — are told apart by
  // keyForFormat. So no set of pictures can be served as another.
  const saveOrientation = useMutation({
    mutationFn: (next: PageFormat) =>
      annualDesignApi.save(cycleId, selectionForPageFormat(next)),
    onSuccess: (fresh) => qc.setQueryData(designKey, fresh),
    onError: (err: MutationError) =>
      toast.error(readError(err, "Could not switch the page format")),
  })
  const orientation = orientationOf(reportDesign.data)
  const pageFormat = pageFormatOf(reportDesign.data)
  // The sheet the pages on screen print on. "a4" for portrait too, so every
  // render key outside the presentation sheet stays what it always was.
  const format: LandscapeFormat = pageFormat === "presentation" ? "presentation" : "a4"
  const saveBrand = useMutation({
    // The modal sends `{ brand }` alone. Omitted fields are left alone
    // server-side, so this cannot clobber the cover or contents keys picked in
    // the rail.
    mutationFn: (selection: DesignSelection) => annualDesignApi.save(cycleId, selection),
    onSuccess: (fresh) => {
      qc.setQueryData(designKey, fresh)
      // The colours are not part of any render cache key — a key names the
      // section, the page and the template, and none of those moved — so every
      // drawn page in the map is now the wrong colour and would be served from
      // memory until the tab was reloaded.
      revokeCycle(cycleId)
      // Both preview queries are staleTime: Infinity, so an invalidate would
      // not refetch them; they have to go.
      qc.removeQueries({ queryKey: ["pm", "cycle", cycleId, "cover-preview"] })
      qc.removeQueries({ queryKey: ["pm", "cycle", cycleId, "toc-preview"] })
    },
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
  //
  // And held off while this screen is still reading its own payload. The run
  // ends by refetching, and the pre-warm used to start in the same instant —
  // so the one request whose failure empties the screen was competing with a
  // five-page render batch for the same backend. Whoever is waiting on the
  // screen goes first.
  //
  // And held off until the design record says which way the report prints, or
  // a landscape report would spend its first renders on portrait pages.
  useDesignPrewarm(
    cycleId,
    data?.sections,
    selected?.code ?? null,
    !run && !isFetching && !reportDesign.isPending,
    orientation,
    format,
  )

  if (isLoading && !data) return <PageLoader />

  // React Query keeps serving the last good payload after a failure, which
  // made a session that had lost access look like a working screen with an
  // unexplained red toast. Say so instead.
  //
  // Not for every failure, though. A background refresh that times out — the
  // designer refetches after every extract run, while pages are being drawn —
  // should not throw away a screen that was working and replace it with a
  // full-page error, when the slightly stale payload already in hand is a far
  // better answer. That case gets the amber strip below.
  //
  // WHICH SPLITS THE TWO ON KIND, NOT ON WHETHER THERE IS STALE DATA TO HIDE
  // BEHIND. Keying it off `!data` alone quietly gave 401 and 403 the soft
  // treatment as well, which is precisely the case this check was written to
  // catch: a revoked session got a working-looking designer with an amber
  // strip, and every card click failed. Nothing here retries a lost session
  // either (see providers.tsx), so the strip's "Refresh" could not have fixed
  // it — it is a dead end dressed as a hiccup.
  const lostAccess = isAuthError(error)
  if (error && (!data || lostAccess)) {
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
  const landscape = orientation === "landscape"
  const effectivePreview = templateToShow(unit, previewKey, orientation, format)
  const option = optionFor(unit, effectivePreview, orientation)
  const customPaper = paperFor(orientation, format)
  const customTemplate = customTemplateFor(unit, orientation, format)
  // The custom card shows its real first sheet once one has been drawn.
  const customThumb = section && unit && customTemplate
    ? peek(cacheKey(cycleId, section.section_code, unit.index,
      renderTemplateTag(CUSTOM_TEMPLATE_KEY, unit, orientation, format)))?.[0] ?? null
    : null

  // The cover and contents design in use in the orientation on screen. In
  // landscape that is the saved landscape pick, else the default — never the
  // portrait pick, which a landscape report does not print.
  const coverInUse = landscape
    ? landscapeCoverKey(reportDesign.data)
    : reportDesign.data?.cover2_template_key ?? null
  const tocInUse = landscape
    ? landscapeTocKey(reportDesign.data)
    : reportDesign.data?.toc_template_key ?? null
  const coverSaving = landscape ? saveLandscapeCover.isPending : saveCover.isPending
  const tocSaving = landscape ? saveLandscapeToc.isPending : saveToc.isPending
  const chooseCover = (key: string) => {
    if (landscape) saveLandscapeCover.mutate(key)
    else saveCover.mutate(key)
  }
  const chooseToc = (key: string) => {
    if (landscape) saveLandscapeToc.mutate(key)
    else saveToc.mutate(key)
  }
  // The section title pages chosen on their own, in the orientation on screen.
  const openerChoice = landscape
    ? landscapeOpenerChoice(reportDesign.data)
    : portraitOpenerChoice(reportDesign.data)
  const openerSaving = landscape ? saveLandscapeOpener.isPending : savePortraitOpener.isPending
  const chooseOpener = (key: string | null) => {
    if (landscape) saveLandscapeOpener.mutate(key)
    else savePortraitOpener.mutate(key)
  }

  // "Use for all sections" applies the landscape card on screen, and says so.
  const keyToApply = landscapeKeyToApply(previewKey, unit)
  const nameToApply = LANDSCAPE_TEMPLATE_SHORT_NAMES[keyToApply] ?? keyToApply

  const reExtract = (sectionCode: string) => {
    revokeSection(cycleId, sectionCode)
    extract.mutate({ sectionCode, force: true })
  }

  // Both bits of state move together HERE, in the handler, and deliberately
  // not in an effect watching previewMode. An effect would fire again on every
  // render while preview is open, so reopening the rail would shut it again
  // the instant you let go of the chevron.
  // The preview opens on the cover and the contents page, so having chosen
  // either is reason enough to look — the old guard counted section templates
  // only, and locked out a report whose cover was the thing just picked.
  //
  // Landscape can always preview: its one cover and contents page always
  // exist, so there is always something real to look at.
  const canPreview =
    landscape ||
    data.units_chosen > 0 ||
    Boolean(reportDesign.data?.cover2_template_key) ||
    Boolean(reportDesign.data?.toc_template_key)
  const previewButtonDisabled = !landscape && data.units_chosen === 0

  const enterPreview = () => {
    setPreviewMode(true)
    setRailCollapsed(true)
  }
  const exitPreview = () => {
    setPreviewMode(false)
    setRailCollapsed(false)
  }

  // previewKey is cleared HERE, in the handler, not in an effect watching the
  // orientation: a card looked at in one orientation means nothing in the
  // other, and this repo's lint rejects setState inside effects anyway.
  const switchOrientation = (next: PageFormat) => {
    setPreviewKey(null)
    setCustomOpen(false)
    saveOrientation.mutate(next)
  }

  const applyLandscapeToAll = () => {
    applyLandscape.mutate(
      { templateKey: keyToApply },
      {
        onSuccess: (res) => {
          if (res.applied === 0) toast(landscapeAppliedText(0, nameToApply))
          else toast.success(landscapeAppliedText(res.applied, nameToApply))
        },
      },
    )
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
            {designCountText(data, orientation)}
          </p>
        </div>
        {/* First in the row and labelled in words: this is the one control
            here that changes the whole document, and it was being missed
            among the ghost buttons. */}
        <OrientationToggle
          value={pageFormat}
          onChange={switchOrientation}
          disabled={!reportDesign.data || reportDesign.data.locked || saveOrientation.isPending}
          saving={saveOrientation.isPending}
          locked={reportDesign.data?.locked ?? false}
        />
        <div className="h-5 w-px shrink-0 bg-slate-200" aria-hidden />
        <Button
          variant="ghost"
          size="sm"
          className="h-8"
          onMouseEnter={() => void qc.prefetchQuery({
            queryKey: DESIGN_CATALOGUE_KEY,
            queryFn: () => annualDesignApi.catalogue(),
            staleTime: Infinity,
          })}
          onClick={() => { setCustomizeTab("brand"); setColorsOpen(true) }}
        >
          <Palette className="mr-1.5 h-3.5 w-3.5" />
          Customize
        </Button>
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
      </div>

      {error && !lostAccess && (
        <div className="flex shrink-0 items-center gap-3 border-b border-amber-200 bg-amber-50 px-5 py-2">
          <p className="min-w-0 flex-1 text-[11px] text-amber-900">
            {readError(error as MutationError, "Could not refresh this cycle.")}{" "}
            Showing what was last loaded.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 shrink-0 text-[11px]"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {railCollapsed ? (
          // Wide enough to keep Preview reachable. The button lives in the
          // rail, so a rail collapsed on purpose — not by entering preview —
          // would otherwise take the only way to start one with it.
          <div className="flex h-full w-10 shrink-0 flex-col items-center gap-2 border-r bg-white py-3">
            <button
              type="button"
              onClick={() => setRailCollapsed(false)}
              className="group rounded-md p-1.5 transition-colors hover:bg-slate-100"
              title="Show the section list"
            >
              <PanelLeftOpen className="h-4 w-4 text-slate-400 group-hover:text-slate-600" />
            </button>
            {!previewMode && (
              <button
                type="button"
                onClick={enterPreview}
                disabled={!canPreview}
                className="rounded-md bg-[#492244] p-1.5 text-white transition-colors hover:bg-[#3C1C39] disabled:opacity-40"
                title="Preview the report"
              >
                <Layers className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex w-[360px] shrink-0 flex-col overflow-hidden border-r bg-white">
            <div className="shrink-0 border-b px-5 py-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${progressPercent(data, orientation)}%` }}
                />
              </div>
            </div>
            {/* Above Cover and outside the scroller, so it is always reachable.
                Deep plum is the palette the REPORTS are drawn in, not the
                product's — this button looks at the document rather than
                editing it, and promoting the colour to a token would imply the
                app had adopted it. */}
            <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
              <Button
                className="h-9 flex-1 justify-start bg-[#492244] text-white hover:bg-[#3C1C39] focus-visible:ring-[#492244]"
                onClick={previewMode ? exitPreview : enterPreview}
                disabled={previewButtonDisabled}
                title={previewButtonTitle(orientation, data.units_chosen)}
              >
                <Layers className="mr-2 h-4 w-4" />
                {previewMode ? "Back to designing" : "Preview"}
              </Button>
              <button
                type="button"
                onClick={() => setRailCollapsed(true)}
                className="shrink-0 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                title="Hide the section list"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <CreateDesignRail
                sections={data.sections}
                selected={previewMode || tocOpen || coverOpen ? null : active}
                onSelect={(next) => {
                  exitPreview()
                  setTocOpen(false)
                  setCoverOpen(false)
                  setSelected(next)
                  setPreviewKey(null)
                  setCustomOpen(false)
                }}
                busyCode={extract.isPending ? extract.variables?.sectionCode : null}
                failed={failures}
                onReExtract={reExtract}
                coverActive={coverOpen}
                coverDesign={coverInUse}
                onSelectCover={() => { exitPreview(); setCoverOpen(true); setTocOpen(false) }}
                tocActive={tocOpen}
                tocDesign={tocInUse}
                onSelectToc={() => { exitPreview(); setTocOpen(true); setCoverOpen(false) }}
                orientation={orientation}
              />
            </div>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
          {previewMode ? (
            // Keyed on the page format so a switch made while previewing
            // starts a fresh run: the panel only starts its run on mount.
            <PreviewAllPanel
              key={pageFormat}
              cycleId={cycleId}
              design={data}
              coverKey={coverInUse}
              tocKey={tocInUse}
              onExit={exitPreview}
              orientation={orientation}
              format={format}
            />
          ) : coverOpen ? (
            // Keyed on the orientation so a design inspected in one
            // orientation is not left on screen in the other.
            <CoverDesignPanel
              key={pageFormat}
              cycleId={cycleId}
              chosen={coverInUse}
              locked={reportDesign.data?.locked ?? false}
              saving={coverSaving}
              onChoose={chooseCover}
              orientation={orientation}
              format={format}
              openerChoice={openerChoice}
              onChooseOpener={chooseOpener}
              savingOpener={openerSaving}
            />
          ) : tocOpen ? (
            <TocDesignPanel
              key={pageFormat}
              cycleId={cycleId}
              chosen={tocInUse}
              locked={reportDesign.data?.locked ?? false}
              saving={tocSaving}
              onChoose={chooseToc}
              orientation={orientation}
              format={format}
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
                  {/* Portrait only: the art director never looks at
                      landscape, so its sentence would be about a page that
                      is not the one on screen. */}
                  {!landscape && section.plan?.why && (
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
                  {landscape && (
                    <div className="mb-3 space-y-2">
                      <p className="text-[11px] leading-relaxed text-slate-500">
                        Pick a landscape template for each section. Sections
                        without one print in a plain two-column landscape layout.
                        &lsquo;Use for all&rsquo; fills only the sections that
                        have no landscape template yet.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-full"
                        onClick={applyLandscapeToAll}
                        disabled={applyLandscape.isPending}
                      >
                        {applyLandscape.isPending ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ListChecks className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Use {nameToApply} for all sections
                      </Button>
                    </div>
                  )}
                  {!landscape && unit.options.length === 0 && (
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
                  {/* Every template, always: the saved cards first, then
                      any the section was extracted too early to list — and
                      all of them when the recommendation lookup failed. */}
                  <TemplateCardGrid
                    options={cardsFor(unit, orientation, format)}
                    previewKey={customOpen ? null : effectivePreview}
                    chosenKey={pickedKey(unit, orientation)}
                    onPreview={(key) => {
                      setCustomOpen(false)
                      setPreviewKey(key)
                    }}
                    disabled={setTemplate.isPending}
                    presentation={format === "presentation"}
                    landscape={landscape}
                    customThumb={customThumb}
                    onCreateCustom={SHOW_CUSTOM_TEMPLATES ? () => setCustomOpen(true) : undefined}
                    customPanelOpen={customOpen}
                  />
                </div>
                <div className="min-h-0 flex-1">
                  {customOpen ? (
                    <CustomTemplatePanel
                      key={`${section.section_code}|${customPaper}`}
                      cycleId={cycleId}
                      sectionCode={section.section_code}
                      sectionTitle={section.title}
                      unit={unit}
                      paper={customPaper}
                      hasExisting={Boolean(customTemplate)}
                      onClose={() => setCustomOpen(false)}
                      onDone={(status) => {
                        // The server saved it and selected it; read it back,
                        // then show it.
                        void refetch().then(() => {
                          setCustomOpen(false)
                          setPreviewKey(CUSTOM_TEMPLATE_KEY)
                          toast.success(customDoneMessage(status))
                        })
                      }}
                    />
                  ) : (
                  <PageRenderPanel
                    cycleId={cycleId}
                    sectionCode={section.section_code}
                    sectionTitle={section.title}
                    unit={unit}
                    templateKey={effectivePreview}
                    option={option}
                    choosing={setTemplate.isPending}
                    orientation={orientation}
                    format={format}
                    onChoose={(key) =>
                      setTemplate.mutate({
                        sectionCode: section.section_code,
                        unitIndex: unit.index,
                        templateKey: key,
                        orientation,
                      })
                    }
                    onRecheck={() =>
                      recheckCustom.mutate({
                        sectionCode: section.section_code,
                        paper: customPaper,
                      })
                    }
                    rechecking={recheckCustom.isPending}
                    onAdjusted={() => refetch()}
                  />
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <UnitJsonPanel unit={unit} open={jsonOpen} onOpenChange={setJsonOpen} />
      {/* The colours modal — the same one the other report kinds use, narrowed
          to its palette half. It seeds itself from the design record (own
          colours, else the company default), so nothing is passed in here but
          the save. */}
      <DesignDialog
        cycleId={cycleId}
        open={colorsOpen}
        onOpenChange={setColorsOpen}
        defaultTab={customizeTab}
        cover={{ title: cycleName }}
        onApply={async (selection) => {
          await saveBrand.mutateAsync(selection)
        }}
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
