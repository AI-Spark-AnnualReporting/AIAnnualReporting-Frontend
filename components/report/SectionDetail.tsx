"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CycleReportSection } from "@/types"
import { SECTION_MODES, SECTION_LAYERS } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  CheckCircle2,
  FileText,
  MousePointerClick,
  Settings,
  Sparkles,
} from "lucide-react"
import { AnalyzeSection } from "@/components/report/AnalyzeSection"
import { AttachSection } from "@/components/report/AttachSection"
import { ExtractSection } from "@/components/report/ExtractSection"
import { GenerateSection } from "@/components/report/GenerateSection"
import { ManualSection } from "@/components/report/ManualSection"

// Shared header for every mode sub-component — title, layer chip, mode badge,
// and the section's content source. Exported so other mode panels (e.g.
// AttachSection in its own file) can render the same header.
export function SectionHeader({ section }: { section: CycleReportSection }) {
  const mode = SECTION_MODES[section.mode]
  const layer = SECTION_LAYERS[section.layer]
  return (
    <div className="border-b px-6 py-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
            layer?.color
          )}
        >
          {layer?.label ?? section.layer}
        </span>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
            mode?.color
          )}
        >
          {mode?.label ?? section.mode}
        </span>
        {!section.ai_allowed && (
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            Manual
          </span>
        )}
        <span className="text-xs text-muted-foreground capitalize">
          {section.content_source}
        </span>
      </div>
      <h2 className="text-lg font-semibold leading-tight">{section.title}</h2>
    </div>
  )
}

// Read-only placeholder body shared by all three modes this stage.
function Placeholder({
  icon: Icon,
  message,
}: {
  icon: typeof Sparkles
  message: string
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
      </div>
    </div>
  )
}

// System-rendered sections (cover, table of contents). The PM doesn't write
// or lock content for these — they're composed at assembly time from cycle
// metadata and the ordered section list. The TOC, for example, is always
// generated from the live section order; the cover from the cycle name +
// fiscal year + headline. No lock or input is needed.
//
// For PMs who want to inject custom text into a system section (e.g. a custom
// cover blurb), we offer a notes textarea that persists locally per cycle +
// section. Backend persistence is a future enhancement; the note shown here is
// a placeholder so the PM has somewhere to capture intent.
function AutoSection({
  section,
  cycleId,
}: {
  section: CycleReportSection
  cycleId: string
}) {
  const storageKey = `cycle:${cycleId}:auto-note:${section.section_code}`
  const isToc =
    /^(toc|table[-_ ]?of[-_ ]?contents)$/i.test(section.section_code) ||
    /table of contents/i.test(section.title)

  const [notes, setNotes] = useState("")
  const [savedNotes, setSavedNotes] = useState("")
  const [hydrated, setHydrated] = useState(false)

  // Hydrate from localStorage on first render — kept out of useEffect to avoid
  // SSR mismatch warnings; we render the textarea empty first and fill it in.
  if (typeof window !== "undefined" && !hydrated) {
    setHydrated(true)
    const stored = window.localStorage.getItem(storageKey) ?? ""
    setNotes(stored)
    setSavedNotes(stored)
  }

  const dirty = notes !== savedNotes

  const save = () => {
    try {
      window.localStorage.setItem(storageKey, notes)
      setSavedNotes(notes)
      toast.success("Notes saved (in this browser)")
    } catch {
      toast.error("Couldn't save notes — browser storage unavailable")
    }
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <SectionHeader section={section} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-6 space-y-5">
          <div className="flex flex-col items-center justify-center text-center py-8 px-4">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Settings className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium mb-1.5">
              Rendered automatically at assembly
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
              {isToc
                ? "The table of contents is generated from the ordered list of sections each time the report is assembled. No action needed here."
                : "This section is composed from cycle metadata (name, fiscal year, headline) at assembly time. No action needed — it always counts as ready."}
            </p>
          </div>

          {/* Custom notes — local-only for v1. Useful for capturing intent
              like "use the brand-team supplied cover image" or specific
              copy that a future backend hook can pick up. */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Optional notes
              </p>
              <span className="text-[11px] text-muted-foreground">
                Saved in this browser
              </span>
            </div>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                isToc
                  ? "Notes for the TOC (e.g. any special ordering instructions)…"
                  : "Notes for this system section (e.g. cover image to use, headline tweaks)…"
              }
              rows={4}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground italic">
                Notes are not yet wired to the assembled report — backend
                support coming.
              </p>
              <Button size="sm" onClick={save} disabled={!dirty}>
                Save notes
              </Button>
            </div>
          </div>

          {/* Always-ready badge — auto sections need no lock. */}
          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900/50 dark:bg-green-950/25">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Always ready
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                System sections don&apos;t need to be locked — they&apos;re
                always included in the assembled report.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// The architectural seam: switches on section.mode. Stage 7 will swap the
// generate body without touching this switch.
export function SectionDetail({
  section,
  cycleId,
}: {
  section: CycleReportSection | null
  cycleId: string
}) {
  if (!section) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={MousePointerClick}
          title="Select a section"
          description="Pick a section from the list to see its details."
        />
      </div>
    )
  }

  // Extract-mode is document-driven: upload runs AI extraction, the PM edits
  // the result, then locks. Takes priority over the ai_allowed branch below.
  if (section.mode === "extract") {
    return <ExtractSection section={section} cycleId={cycleId} />
  }

  // Analyze-mode: structured Markdown findings from the analyze agent. No
  // document — department digests are the source. Locks like generate.
  if (section.mode === "analyze") {
    return <AnalyzeSection section={section} cycleId={cycleId} />
  }

  // Manual sections (PM provides the content themselves) override mode-based
  // UI — no source picker and no Generate button. The input shape depends on
  // the section's content_source:
  //   - narrative → free-text editor (ManualSection)
  //   - structured / financials / composite → file upload (AttachSection)
  if (!section.ai_allowed) {
    if (section.content_source === "narrative") {
      return <ManualSection section={section} cycleId={cycleId} />
    }
    return <AttachSection section={section} cycleId={cycleId} />
  }

  switch (section.mode) {
    case "generate":
      return <GenerateSection section={section} cycleId={cycleId} />
    case "attach":
      return <AttachSection section={section} cycleId={cycleId} />
    case "auto":
      return <AutoSection section={section} cycleId={cycleId} />
    default:
      return (
        <div className="flex flex-1 flex-col min-h-0">
          <SectionHeader section={section} />
          <Placeholder icon={FileText} message="Unknown section mode." />
        </div>
      )
  }
}
