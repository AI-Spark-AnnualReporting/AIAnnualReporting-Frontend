"use client"

/**
 * Design2 — a dev-testing probe, not a feature.
 *
 * Pick one section of the assembled report and watch it go through GPT-4.1,
 * which decomposes it into layout-ready blocks. The JSON is shown raw and
 * thrown away when the dialog closes: nothing is saved, nothing is rendered
 * into a template. A later pass consumes this shape for real.
 *
 * The progress here is genuine. Each step arrives from the server as it
 * starts, and each note under it is a fact the server measured a moment
 * earlier. The one stage nobody can measure — the model call — says so with a
 * shimmer instead of inventing a percentage.
 */

import { useEffect, useRef, useState } from "react"
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  streamSectionDesignBlocks,
  type DesignBlockNote,
  type DesignBlockStep,
  type DesignBlocksError,
  type DesignBlocksResult,
} from "@/lib/api/designBlocks"
import { cn } from "@/lib/utils"
import type { FinalReportSection } from "@/types"

/**
 * Only narrative sections carry prose. An attachment, the cover or the table
 * of contents has nothing to decompose, and the server answers 422 — so those
 * rows are listed but not clickable rather than offering a guaranteed failure.
 */
function hasProse(section: FinalReportSection): boolean {
  return section.type === "narrative" && !!section.content?.trim()
}

export function Design2Dialog({
  cycleId,
  sections,
  open,
  onOpenChange,
}: {
  cycleId: string
  sections: FinalReportSection[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [active, setActive] = useState<FinalReportSection | null>(null)
  const [steps, setSteps] = useState<DesignBlockStep[]>([])
  const [notes, setNotes] = useState<DesignBlockNote[]>([])
  const [result, setResult] = useState<DesignBlocksResult | null>(null)
  const [error, setError] = useState<DesignBlocksError | null>(null)
  const [copied, setCopied] = useState(false)
  // Bumping this re-runs the effect for the same section, which is what the
  // retry button needs — setActive to the same object would change nothing.
  const [attempt, setAttempt] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  // Reset here rather than in the effect: clearing state synchronously inside
  // an effect body cascades an extra render, and every entry point into a run
  // is a user action anyway.
  const resetRun = () => {
    setSteps([])
    setNotes([])
    setResult(null)
    setError(null)
    setCopied(false)
  }

  const openSection = (section: FinalReportSection) => {
    resetRun()
    setActive(section)
  }

  const retry = () => {
    resetRun()
    setAttempt((a) => a + 1)
  }

  useEffect(() => {
    if (!open || !active) return

    const ac = new AbortController()
    abortRef.current = ac

    void streamSectionDesignBlocks(
      cycleId,
      active.section_code,
      {
        onStep: (s) => setSteps((prev) => [...prev, s]),
        onNote: (n) => setNotes((prev) => [...prev, n]),
        onResult: setResult,
        onError: setError,
      },
      ac.signal,
    )

    // Covers all three ways this can end early: the dialog closes, the user
    // picks a different section, or the page unmounts. Note this stops the
    // CLIENT only — the OpenAI call runs in a worker thread on the server and
    // completes (and bills) regardless. Fine for a dev probe.
    return () => ac.abort()
  }, [open, active, cycleId, attempt])

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      abortRef.current?.abort()
      // Reset so reopening lands on the list rather than a stale run.
      setActive(null)
    }
    onOpenChange(next)
  }

  const ordered = [...sections].sort((a, b) => a.order - b.order)
  const current = steps.length ? steps[steps.length - 1] : null
  const finished = !!result || !!error

  const copyJson = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard is blocked in some contexts; the JSON is selectable anyway.
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden">
        {!active ? (
          <>
            <DialogHeader>
              <DialogTitle>Design2 — structured blocks</DialogTitle>
              <DialogDescription>
                Dev testing. Pick a section to run it through GPT-4.1 and see
                the raw JSON it comes back with. Nothing is saved.
              </DialogDescription>
            </DialogHeader>

            <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
              {ordered.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  This report has no sections yet.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {ordered.map((section) => {
                    const clickable = hasProse(section)
                    return (
                      <button
                        key={section.section_code}
                        type="button"
                        onClick={() => openSection(section)}
                        disabled={!clickable}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-start transition-colors",
                          clickable
                            ? "hover:bg-slate-50"
                            : "cursor-not-allowed opacity-50",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                          {section.title}
                        </span>
                        {!clickable && (
                          <span className="shrink-0 text-[11px] text-slate-400">
                            No narrative content
                          </span>
                        )}
                        <span className="shrink-0 font-mono text-[11px] text-slate-400">
                          {section.section_code}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label="Back to sections"
                  onClick={() => setActive(null)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <DialogTitle className="min-w-0 truncate">
                  {active.title}
                </DialogTitle>
              </div>
              <DialogDescription className="font-mono text-[11px]">
                {active.section_code}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
              {/* Only steps the server has actually announced are drawn —
                  showing a stage that has not happened is the lie this whole
                  endpoint exists to avoid. */}
              <ol className="space-y-2">
                {steps.map((step) => {
                  const isLast = step.index === current?.index
                  const done = !isLast || finished
                  const stepNotes = notes.filter((n) => n.index === step.index)
                  return (
                    <li key={step.index} className="flex gap-2.5">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                        {done ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : step.indeterminate ? (
                          <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
                        ) : (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-sm",
                            done
                              ? "text-slate-500"
                              : "font-medium text-slate-900",
                          )}
                        >
                          {step.label}
                        </p>
                        {stepNotes.map((note, i) => (
                          <p
                            key={i}
                            className="mt-0.5 font-mono text-[11px] leading-relaxed text-slate-400"
                          >
                            {note.text}
                          </p>
                        ))}
                        {!done && step.indeterminate && (
                          <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full w-1/3 animate-pulse rounded-full bg-indigo-400" />
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="flex items-start gap-2">
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[11px] text-red-500">
                        {error.status} {error.code}
                      </p>
                      <p className="mt-0.5 text-sm text-red-900">
                        {error.message}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7"
                        onClick={retry}
                      >
                        Try again
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {result && (
                <div className="rounded-lg border bg-slate-50">
                  <div className="flex items-center justify-between border-b px-3 py-1.5">
                    <span className="text-[11px] font-medium text-slate-500">
                      Raw JSON
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={copyJson}
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <pre
                    className="max-h-[45vh] overflow-auto whitespace-pre-wrap break-words p-3 text-[12px] leading-relaxed text-slate-800"
                    style={{ fontFamily: "var(--font-dm-mono), monospace" }}
                  >
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
