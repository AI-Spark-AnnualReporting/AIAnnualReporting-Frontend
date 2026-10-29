"use client"

import { Suspense, use, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { RouteGuard } from "@/components/auth/RouteGuard"
import {
  useBuildReadiness,
  useFinalReport,
  usePMCycleSections,
  useAssemblyReadiness,
  useReportApproval,
} from "@/hooks/useReportBuilder"
import { useReportReview } from "@/hooks/useReportReview"
import { SectionFindingsBanner } from "@/components/report/SectionFindingsBanner"
import {
  FixPrefillContext,
  VALIDATION_SUMMARY_CODE,
  findingsBySection,
  highlightRegex,
  highlightsBySection,
} from "@/lib/validation-fixes"
import { ProseHighlightContext } from "@/components/ui/prose-preview"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { PageLoader } from "@/components/ui/spinner"
import { EmptyState } from "@/components/ui/empty-state"
import { Button } from "@/components/ui/button"
import { SectionList } from "@/components/report/SectionList"
import { SectionDetail } from "@/components/report/SectionDetail"
import type { ContentLanguage } from "@/types"
import { AssembleEntry } from "@/components/report/AssembleEntry"
import { SectionOutlineDialog } from "@/components/report/SectionOutlineDialog"
import {
  ExecutiveSummaryPanel,
  EXECUTIVE_SUMMARY_CODE,
} from "@/components/report/ExecutiveSummaryPanel"
import { ArrowLeft, ChevronsRight, ClipboardList, FileText, List, ShieldAlert } from "lucide-react"
import { isReportGeneratedSection, isSectionReady } from "@/lib/section-filters"

export default function ReportBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return (
    <RouteGuard allowedRoles={["project_manager", "admin"]}>
      {/* useSearchParams (in BuilderShell) needs a Suspense boundary in the
          App Router. */}
      <Suspense fallback={<PageLoader />}>
        <BuilderShell cycleId={id} />
      </Suspense>
    </RouteGuard>
  )
}

function BuilderShell({ cycleId }: { cycleId: string }) {
  const router = useRouter()
  const [outlineOpen, setOutlineOpen] = useState(false)
  // Set when a subsection row is clicked; cleared once the heading has been
  // scrolled to. Kept in state rather than scrolled inline because selecting a
  // different section has to render its body first — the element does not
  // exist yet at the moment of the click.
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null)
  const readinessQuery = useBuildReadiness(cycleId)
  const sectionsQuery = usePMCycleSections(cycleId)
  const { data: pmData } = usePMCycleDashboard(cycleId)
  // A report was assembled and a section has changed since. Same query the
  // header's AssembleEntry reads, so the banner below and the "Assemble again"
  // button can never disagree — React Query serves both from one fetch.
  const stale = !!useAssemblyReadiness(cycleId).data?.stale
  // Signed off — from this side's Approve & Lock or a Communication Hub reviewer —
  // or with the client for review, when the server refuses edits too.
  const signedOff = !!useReportApproval(cycleId).data?.locked
  // Closed once the report was sent to the client: changes then go through
  // Edit report on the report page, never back through the Builder.
  const sentToClient = !!useReportReview(cycleId).data?.share
  const reportLocked = signedOff || sentToClient
  const withClient = sentToClient

  // A Fix button on the validation page links here with ?section= (open that
  // section) and, for an AI fix, ?fix= (the refine instruction to start with).
  // Read once, from the router - not window.location: on a link click inside
  // the app the new page renders before the address bar changes, so
  // window.location still held the validation page's URL and the builder
  // opened on its first section instead.
  const searchParams = useSearchParams()
  const [selectedCode, setSelectedCode] = useState<string | null>(() =>
    searchParams.get("section"),
  )
  // `todo` is a fix the PM does by hand (an uncovered brief ask): shown in the
  // banner, kept out of the refine box.
  const [fix, setFix] = useState<{ sectionCode: string; text: string; manual: boolean } | null>(() => {
    const sectionCode = searchParams.get("section")
    const aiText = searchParams.get("fix")
    const todo = searchParams.get("todo")
    if (!sectionCode) return null
    if (aiText) return { sectionCode, text: aiText, manual: false }
    if (todo) return { sectionCode, text: todo, manual: true }
    return null
  })
  // Which side is open: the validation card ("fix") or the section list
  // ("list"). Only one at a time, so the text keeps its width. Arriving from
  // a Fix button opens the card; picking a section from the list opens the list.
  const [side, setSide] = useState<"fix" | "list">(() =>
    searchParams.get("fix") || searchParams.get("todo") ? "fix" : "list",
  )

  // Only when the PM came from the validation page's Fix button: a PM who
  // just went back to the Builder to change something should not be shown
  // every finding (user decision, 2026-10-25). Read once, for the whole visit.
  const [fromValidation] = useState(() => searchParams.get("from") === "validation")

  // The last validation's findings, by section, for the banner and the rail's
  // counts. The summary is filed under its own code in each.
  const lastValidation = useFinalReport(cycleId).data?.validation
  const validation = fromValidation ? lastValidation : undefined
  const findings = validation ? findingsBySection(validation) : {}
  if (findings[VALIDATION_SUMMARY_CODE]) {
    findings[EXECUTIVE_SUMMARY_CODE] = findings[VALIDATION_SUMMARY_CODE]
  }
  const highlights = validation ? highlightsBySection(validation) : {}
  const findingCounts: Record<string, number> = {}
  for (const [code, lines] of Object.entries(findings)) {
    findingCounts[code] = lines.length
  }

  const readiness = readinessQuery.data
  const sections = (sectionsQuery.data ?? []).filter(
    (s) => !isReportGeneratedSection(s),
  )

  // Scroll to the clicked subsection once its section's body has rendered.
  //
  // Two frames, not one: selecting a different section re-renders the panel,
  // and on the first frame after that state change the new body — and so the
  // heading — is not in the DOM yet. Missing the element is harmless, it just
  // leaves the panel at the top, which is where it would have been anyway.
  useEffect(() => {
    if (!pendingAnchor) return
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        document
          .getElementById(pendingAnchor)
          ?.scrollIntoView({ behavior: "smooth", block: "start" })
        setPendingAnchor(null)
      })
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [pendingAnchor, selectedCode])

  // Defend against deep-linking into an unbuildable cycle.
  useEffect(() => {
    if (readiness && !readiness.can_build) {
      toast.error("This cycle isn't ready to build yet")
      router.replace(`/pm/cycles/${cycleId}`)
    }
  }, [readiness, router, cycleId])

  if (readinessQuery.isLoading || sectionsQuery.isLoading) return <PageLoader />

  // Only when there is nothing to show. A failed RELOAD (after a save, say)
  // keeps the builder on screen with what it has; replacing it with this page
  // made one dropped connection look like losing access.
  if (
    (readinessQuery.isError && !readinessQuery.data) ||
    (sectionsQuery.isError && !sectionsQuery.data)
  ) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Can't open the builder"
        description="This cycle's builder couldn't be loaded — you may not have access to it."
        action={
          <Link href={`/pm/cycles/${cycleId}`}>
            <Button variant="outline">Back to cycle</Button>
          </Link>
        }
      />
    )
  }

  // Redirect effect above handles this — render a skeleton meanwhile.
  if (readiness && !readiness.can_build) return <PageLoader />

  const ordered = [...sections].sort((a, b) => a.display_order - b.display_order)
  const total = sections.length
  // How much of the report has something in it. Auto sections are rendered at
  // assembly time, so they count as done. The Executive Summary is not in this
  // list at all: it is synthetic, so it can't move the counter.
  const written = sections.filter(isSectionReady).length
  const writtenPct = total > 0 ? Math.round((written / total) * 100) : 0
  // Default to the first section until the PM picks one — derived during render
  // (no effect) so the initial selection never causes a cascading re-render.
  const effectiveCode = selectedCode ?? ordered[0]?.section_code ?? null
  const selected =
    sections.find((s) => s.section_code === effectiveCode) ?? null
  // The Executive Summary has no section row — the rail selects it by its
  // synthetic code and the right pane swaps in its own read-only panel.
  const execSummarySelected = effectiveCode === EXECUTIVE_SUMMARY_CODE
  const cycleMeta = (pmData as { cycle?: { cycle_name?: string; content_language?: ContentLanguage } } | undefined)?.cycle
  const cycleName = cycleMeta?.cycle_name
  const contentLanguage = cycleMeta?.content_language ?? "english"
  const isRtl = contentLanguage === "arabic"
  const suggestion = fix?.sectionCode === effectiveCode ? fix.text : null
  const sectionFindings = effectiveCode ? findings[effectiveCode] ?? [] : []
  // The validation card shows only for a section with something to fix.
  const hasCard = !!effectiveCode && !reportLocked && (sectionFindings.length > 0 || !!suggestion)
  const listFolded = hasCard && side === "fix"
  // The fix counts as done once the section was edited since the check, and,
  // for banned words, none is left in the text. Same rule as the Validation
  // page's "Fixed"; an Undo back to the checked text clears it again.
  const editedSinceCheck = validation?.edited_since_check ?? []
  const bannedLeft = effectiveCode ? validation?.voice_left?.[effectiveCode] ?? [] : []
  const fixDone =
    !!suggestion &&
    !!effectiveCode &&
    editedSinceCheck.includes(effectiveCode) &&
    !bannedLeft.some((phrase) => suggestion.toLowerCase().includes(`"${phrase}"`))

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={() => {
            // Go back to wherever the PM actually came from. The plan page
            // mirrors its wizard step into the URL, so this returns to Themes
            // — the screen Start Building launches from — rather than to
            // Sections.
            //
            // The fallback covers a direct link or a new tab, where there is
            // no history to pop. It goes to that same Themes step, not to the
            // cycle page: the builder's predecessor is the plan, and landing a
            // step further out than the arrow promises is its own surprise.
            if (window.history.length > 1) router.back()
            else router.push(`/pm/cycles/${cycleId}/plan?step=2`)
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-slate-900">
          Report Builder{cycleName ? ` — ${cycleName}` : ""}
        </h1>
        {/* Same dialog as the rail's own "Outline" row — up here it
            is reachable without scrolling the rail to the bottom. */}
        <Button
          variant="outline"
          onClick={() => setOutlineOpen(true)}
          className="shrink-0 border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        >
          <List className="mr-1.5 h-4 w-4" />
          Outline
        </Button>
        <Link href={`/pm/cycles/${cycleId}/plan`} className="shrink-0">
          <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
            <ClipboardList className="mr-1.5 h-4 w-4" />
            Review Plan
          </Button>
        </Link>
        <AssembleEntry cycleId={cycleId} />
      </div>

      {/* Body — two cards */}
      <div className="flex min-h-0 flex-1 gap-6">
        {/* Left — folded to a strip while the validation card is open */}
        {listFolded && (
          <button
            type="button"
            onClick={() => setSide("list")}
            title="Open the section list"
            className="flex w-[52px] shrink-0 flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white py-3 text-indigo-600 shadow-sm transition-colors hover:bg-indigo-50"
          >
            <ChevronsRight className="h-4 w-4 shrink-0" />
            <span className="text-xs font-semibold text-slate-500 [writing-mode:vertical-rl]">
              Sections · {written} of {total} written
            </span>
          </button>
        )}

        {/* Left — progress + section list */}
        <div
          className={`${listFolded ? "hidden" : "flex"} w-[360px] shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm`}
        >
          <div className="shrink-0 border-b border-slate-100 px-5 py-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900">
                {written} of {total} sections written
              </span>
              <FileText className="h-4 w-4 text-slate-400" />
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all"
                style={{ width: `${writtenPct}%` }}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <SectionList
              sections={ordered}
              selectedCode={effectiveCode}
              onSelect={(code, anchorId) => {
                setSelectedCode(code)
                setPendingAnchor(anchorId ?? null)
                setSide("list")
                // The suggested fix belongs to the section it came for.
                if (code !== fix?.sectionCode) setFix(null)
              }}
              isRtl={isRtl}
              showExecutiveSummary
              onViewAll={() => setOutlineOpen(true)}
              findingCounts={findingCounts}
            />
          </div>
        </div>

        {/* Right — mode-appropriate detail */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          {execSummarySelected ? (
            <ExecutiveSummaryPanel />
          ) : (
            // Withdrawn once the fix is done, so the AI box empties itself.
            <FixPrefillContext.Provider value={fix && !fix.manual && !fixDone ? fix : null}>
              {/* The open section's findings, marked in its preview. */}
              <ProseHighlightContext.Provider
                value={
                  reportLocked || !effectiveCode
                    ? null
                    : highlightRegex(highlights[effectiveCode])
                }
              >
                <SectionDetail
                  section={selected}
                  cycleId={cycleId}
                  stale={stale}
                  reportLocked={reportLocked}
                  withClient={withClient && !signedOff}
                  hasFindings={!!effectiveCode && (findings[effectiveCode]?.length ?? 0) > 0}
                  contentLanguage={contentLanguage}
                  isRtl={isRtl}
                />
              </ProseHighlightContext.Provider>
            </FixPrefillContext.Provider>
          )}
        </div>

        {/* Right — the validation card, folded while the list is open */}
        {hasCard && (
          <SectionFindingsBanner
            cycleId={cycleId}
            findings={sectionFindings}
            suggestion={suggestion}
            fixed={fixDone}
            isSummary={execSummarySelected}
            folded={side === "list"}
            onToggle={() => setSide(side === "fix" ? "list" : "fix")}
          />
        )}
      </div>

      <SectionOutlineDialog
        cycleId={cycleId}
        sections={ordered}
        open={outlineOpen}
        onOpenChange={setOutlineOpen}
        onSelect={setSelectedCode}
        reportLocked={reportLocked}
        isRtl={isRtl}
      />
    </div>
  )
}
