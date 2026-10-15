"use client"

/**
 * "Create a custom template" — the right-hand panel for one section.
 *
 * The PM describes the page they want (or leaves it empty and lets the
 * designer choose). The server then runs a loop that takes a minute or three:
 * a short brief, a designer model writes the layout, the engine fills it with
 * the section's REAL content and checks the printed result, and the designer
 * fixes whatever the check found. Only a layout that passes is saved, so
 * nothing broken can reach the report.
 *
 * The run lives on the server, not in this component. Leaving the section and
 * coming back finds it still going (the status is read on mount), and a run
 * that finished while nobody was looking is picked up the same way.
 */

import { AlertTriangle, Check, Loader2, Sparkles } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { readError, type MutationError } from "@/hooks/useReportBuilder"
import {
  createDesignApi, type CustomPaper, type CustomTemplateStatus, type DesignUnit,
} from "@/lib/api/createDesign"

/** How often the run's progress is read while it is going. */
const POLL_MS = 3000
/**
 * When the screen stops waiting. A run is up to four rounds of designing,
 * printing and reviewing, each a long reasoning call; past this something is
 * stuck, and a spinner that never ends is worse than an honest "try again".
 */
const GIVE_UP_MS = 20 * 60 * 1000
const MAX_CHARS = 2000

/** Real things PMs ask for, as one-click starting points. */
const EXAMPLES = [
  "A big image area on the left of the first page, with two text columns on the right.",
  "Key figures set large in a brand-coloured band across the top.",
  "Calm and minimal: lots of white space, one column of text, quotes in the margin.",
  "Open with the main quote across the full page, then the text in two columns.",
]

const PAPER_NAMES: Record<CustomPaper, string> = {
  portrait: "A4 portrait",
  landscape: "A4 landscape",
  presentation: "16:9 presentation",
}

/** The stages of a run, in order, as the PM should read them. */
const STAGES = [
  { step: "brief", label: "Reading your request" },
  { step: "build", label: "Designing every sheet of the section" },
  { step: "check", label: "Checking it prints with your real content" },
  { step: "judge", label: "Checking it matches your request" },
  { step: "fix", label: "Improving the design" },
] as const

/** Which stage index a server step maps to. */
function stageIndex(step: CustomTemplateStatus["step"]): number {
  if (step === "build") return 1
  if (step === "check") return 2
  if (step === "judge") return 3
  if (step === "fix" || step === "explain") return 4
  return 0
}

/** "Paragraphs 14 · figures 6" for the content the designer will lay out. */
function contentFacts(unit: DesignUnit): { label: string; value: number }[] {
  const paras = (unit.blocks.narrative_blocks ?? []).length
  const figures = (unit.blocks.numeric_data ?? []).length
  const quotes = (unit.blocks.pull_quotes ?? []).length
  const tables = (unit.blocks.tables ?? []).length
  return [
    { label: paras === 1 ? "paragraph" : "paragraphs", value: paras },
    { label: figures === 1 ? "figure" : "figures", value: figures },
    { label: quotes === 1 ? "quote" : "quotes", value: quotes },
    { label: tables === 1 ? "table" : "tables", value: tables },
  ]
}

export function CustomTemplatePanel({
  cycleId,
  sectionCode,
  sectionTitle,
  unit,
  paper,
  hasExisting,
  onDone,
  onClose,
}: {
  cycleId: string
  sectionCode: string
  sectionTitle: string
  unit: DesignUnit
  paper: CustomPaper
  /** The page already has a custom template for this sheet. */
  hasExisting: boolean
  /** A new template was saved; the screen should show it. Gets the final status. */
  onDone: (status: CustomTemplateStatus) => void
  onClose: () => void
}) {
  const [instructions, setInstructions] = useState("")
  const [status, setStatus] = useState<CustomTemplateStatus | null>(null)
  const [starting, setStarting] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  }, [onDone])

  const running = status?.status === "running"

  const readStatus = useCallback(async () => {
    try {
      const next = await createDesignApi.customTemplateStatus(cycleId, sectionCode, paper)
      setStatus(next)
      if (next.status === "running" && next.started_at) {
        setStartedAt((s) => s ?? next.started_at! * 1000)
      }
      return next
    } catch (e) {
      setRequestError(readError(e as MutationError, "Could not read the progress."))
      return null
    }
  }, [cycleId, sectionCode, paper])

  // On opening: is a run already going (started before a refresh, or from
  // another tab)? Reading it here is what lets the PM leave and come back.
  useEffect(() => {
    void readStatus()
  }, [readStatus])

  // While a run is going: poll, tick the clock, and stop at the cut-off.
  useEffect(() => {
    if (!running) return
    const poll = window.setInterval(async () => {
      const next = await readStatus()
      if (next?.status === "done") doneRef.current(next)
    }, POLL_MS)
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      window.clearInterval(poll)
      window.clearInterval(tick)
    }
  }, [running, readStatus])

  const elapsed = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0
  const timedOut = running && startedAt !== null && now - startedAt > GIVE_UP_MS

  const start = async () => {
    setStarting(true)
    setRequestError(null)
    try {
      await createDesignApi.startCustomTemplate(cycleId, sectionCode, paper, instructions.trim())
      setStartedAt(Date.now())
      setNow(Date.now())
      await readStatus()
    } catch (e) {
      setRequestError(readError(e as MutationError, "The designer could not be started."))
    } finally {
      setStarting(false)
    }
  }

  const addExample = (text: string) => {
    setInstructions((current) => {
      const joined = current.trim() ? `${current.trim()} ${text}` : text
      return joined.slice(0, MAX_CHARS)
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b px-5 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
            Custom template
          </p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {sectionTitle} · {PAPER_NAMES[paper]}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-8" onClick={onClose}>
          {running ? "Keep working elsewhere" : "Back to templates"}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50">
        <div className="mx-auto max-w-[620px] px-6 py-6">
          {/* Only a run that is GOING takes over the panel. A finished one
              closes it (onDone), and one that finished earlier, while nobody
              was looking, is already a card on the left. */}
          {running && status ? (
            <RunProgress
              status={status}
              elapsed={elapsed}
              timedOut={timedOut}
              onRetry={() => setStatus(null)}
            />
          ) : (
            <>
              {status?.status === "failed" && (
                <div className="mb-5 rounded-[10px] border border-amber-200 bg-amber-50 p-4">
                  <p className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-900">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    This layout didn&apos;t pass its check, so nothing was changed
                  </p>
                  {status.summary && (
                    <p className="mt-1.5 text-[12px] leading-relaxed text-amber-900">
                      {status.summary}
                    </p>
                  )}
                  {!!status.problems?.length && (
                    <details className="mt-2 text-[11px] text-amber-800">
                      <summary className="cursor-pointer select-none font-medium">
                        What the check found
                      </summary>
                      <ul className="mt-1.5 list-disc space-y-1 ps-4">
                        {status.problems.slice(0, 6).map((p, i) => (
                          <li key={i}>{p.message}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}

              <label htmlFor="custom-template-ask" className="block text-[13px] font-semibold text-slate-900">
                Describe the page you want
              </label>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
                Say where things should go and how it should feel. Leave it empty
                and the designer picks a layout that suits this section.
              </p>
              <textarea
                id="custom-template-ask"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value.slice(0, MAX_CHARS))}
                rows={5}
                placeholder="For example: a large image area across the top half of the first page, the three key figures below it, then the text in two columns."
                className="mt-3 w-full resize-y rounded-[10px] border border-slate-300 bg-white px-3 py-2.5 text-[13px] leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <div className="mt-1 text-end text-[10.5px] tabular-nums text-slate-400">
                {instructions.length} / {MAX_CHARS}
              </div>

              <p className="mt-2 text-[11px] font-medium text-slate-500">Start from an idea</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {EXAMPLES.map((text) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => addExample(text)}
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-start text-[11px] leading-snug text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                  >
                    {text}
                  </button>
                ))}
              </div>

              <div className="mt-6 rounded-[10px] border border-slate-200 bg-white p-4">
                <p className="text-[12px] font-semibold text-slate-900">What the designer lays out</p>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                  {contentFacts(unit).map((fact) => (
                    <span key={fact.label} className="text-[12px] text-slate-600">
                      <span className="font-semibold tabular-nums text-slate-900">{fact.value}</span>{" "}
                      {fact.label}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  Everything prints, in your brand colours. Image areas are placeholders
                  for your designer. Charts, icons and new wording aren&apos;t possible yet.
                </p>
              </div>

              {requestError && (
                <p className="mt-4 text-[12px] text-red-700">{requestError}</p>
              )}

              <div className="mt-6 flex items-center gap-3">
                <Button variant="brand" onClick={start} disabled={starting}>
                  {starting ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1.5 h-4 w-4" />
                  )}
                  {hasExisting ? "Design a new layout" : "Design this page"}
                </Button>
                <span className="text-[11px] leading-snug text-slate-500">
                  Usually 3–8 minutes: it checks the printed result against your
                  request and keeps improving it. You can work on other sections meanwhile.
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** The run, stage by stage, while it is going (and the moment it finishes). */
function RunProgress({
  status,
  elapsed,
  timedOut,
  onRetry,
}: {
  status: CustomTemplateStatus
  elapsed: number
  timedOut: boolean
  onRetry: () => void
}) {
  const done = status.status === "done"
  const current = done ? STAGES.length : stageIndex(status.step)
  const minutes = Math.floor(elapsed / 60)
  const seconds = String(elapsed % 60).padStart(2, "0")

  if (timedOut) {
    return (
      <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-4">
        <p className="text-[13px] font-semibold text-amber-900">This is taking longer than it should</p>
        <p className="mt-1 text-[12px] leading-relaxed text-amber-900">
          The designer hasn&apos;t answered in 8 minutes. Your current template is unchanged.
        </p>
        <Button variant="outline" size="sm" className="mt-3 h-8" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div aria-live="polite">
      <p className="text-[13px] font-semibold text-slate-900">
        {done ? "Your custom template is ready" : "Designing your page"}
      </p>
      <p className="mt-1 text-[12px] text-slate-500">
        {done
          ? "It passed the check with every paragraph, figure, quote and table on the page."
          : `${minutes}:${seconds} so far · usually 3–8 minutes`}
      </p>

      <ol className="mt-5 space-y-3">
        {STAGES.map((stage, index) => {
          const finished = index < current
          const active = index === current && !done
          const round = stage.step === "check" || stage.step === "judge" || stage.step === "fix"
          return (
            <li key={stage.step} className="flex items-start gap-3">
              <span
                className={
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold " +
                  (finished
                    ? "bg-emerald-500 text-white"
                    : active
                      ? "bg-indigo-600 text-white"
                      : "border border-slate-300 bg-white text-slate-400")
                }
              >
                {finished ? <Check className="h-3 w-3" /> : active ? (
                  <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                ) : index + 1}
              </span>
              <span className="min-w-0">
                <span className={"block text-[12.5px] " + (active ? "font-semibold text-slate-900" : finished ? "text-slate-700" : "text-slate-400")}>
                  {stage.label}
                  {active && round && status.round ? (
                    <span className="ms-1.5 font-normal text-slate-500">· round {status.round}</span>
                  ) : null}
                </span>
                {active && status.message && (
                  <span className="mt-0.5 block text-[11px] text-slate-500">{status.message}</span>
                )}
                {active && stage.step === "fix" && !!status.wishes_total && (
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    {status.wishes_met ?? 0} of {status.wishes_total} wishes met so far
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ol>

      {status.brief?.summary_for_pm && (
        <div className="mt-6 rounded-[10px] border border-indigo-100 bg-white p-4">
          <p className="text-[12px] font-semibold text-slate-900">The plan</p>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-700">
            {status.brief.summary_for_pm}
          </p>
          {!!status.brief.cannot_do?.length && (
            <ul className="mt-2 list-disc space-y-0.5 ps-4 text-[11px] text-slate-500">
              {status.brief.cannot_do.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
