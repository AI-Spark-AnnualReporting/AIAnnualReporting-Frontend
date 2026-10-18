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

import { AlertTriangle, Check, Loader2, Sparkles, Undo2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { readError, type MutationError } from "@/hooks/useReportBuilder"
import {
  createDesignApi, type CustomPaper, type CustomTemplateStatus, type DesignUnit,
} from "@/lib/api/createDesign"
import {
  activeCardId, countContent, hasSentence, ideaRowsFor, presetCardsFor, toggleIdea,
  type ContentCounts, type IdeaRow, type PresetCard,
} from "@/lib/customTemplateStartingPoints"

/** How often the run's progress is read while it is going. */
const POLL_MS = 3000
/**
 * When the screen stops waiting. A run is up to four rounds of designing,
 * printing and reviewing, each a long reasoning call. The backend starts no
 * new round after 12 minutes (custom_template_time_budget_seconds), and the
 * round already going may take a few more; past this something is stuck, and
 * a spinner that never ends is worse than an honest "try again".
 */
const GIVE_UP_MS = 25 * 60 * 1000
const MAX_CHARS = 2000

/**
 * A request that is safe for any section: no figures, quotes or "every page"
 * promise the section might not be able to keep.
 */
const PLACEHOLDER =
  "For example: Open with a wide image area across the top half of the first page. " +
  "Set the text in two columns with a thin brand-colour rule between them. " +
  "Keep the design calm and premium, with lots of white space."

// Copied from DesignDialog.tsx (TAB_LIST / TAB_TRIGGER) and TemplateCardGrid.tsx
// (TILE and the tile colours), as literal hexes for the reason given there, so
// the starting points read as the same family as the template cards beside them.
const TAB_LIST = "h-auto gap-1 rounded-full bg-[#F1F5F9] p-1"
const TAB_TRIGGER =
  "rounded-full px-3 py-1.5 text-[12px] font-semibold text-[#64748B] " +
  "data-[state=active]:bg-white data-[state=active]:text-[#0F172A] data-[state=active]:shadow-sm"
const TILE = "rounded-[10px]"
// Not rounded-full: a long idea wraps to two lines, and a two-line pill looks broken.
const IDEA_CHIP =
  "inline-flex items-start gap-1 rounded-[12px] border px-2.5 py-1 text-start text-[11px] leading-snug " +
  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 " +
  "disabled:cursor-not-allowed disabled:opacity-50 "
const IDEA_CHIP_ON = "border-indigo-400 bg-indigo-50 text-indigo-700"
const IDEA_CHIP_OFF = "border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"

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

/**
 * "Paragraphs 14 · figures 6" for the content the designer will lay out —
 * counted as it prints, the same numbers the starting points are chosen by.
 */
function contentFacts(counts: ContentCounts): { label: string; value: number }[] {
  return [
    { label: counts.paragraphs === 1 ? "paragraph" : "paragraphs", value: counts.paragraphs },
    { label: counts.figures === 1 ? "figure" : "figures", value: counts.figures },
    { label: counts.quotes === 1 ? "quote" : "quotes", value: counts.quotes },
    { label: counts.tables === 1 ? "table" : "tables", value: counts.tables },
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
  /** What "Undo" brings back after a complete design replaced the PM's text. */
  const [replacedText, setReplacedText] = useState<string | null>(null)
  const [status, setStatus] = useState<CustomTemplateStatus | null>(null)
  const [starting, setStarting] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const askRef = useRef<HTMLTextAreaElement>(null)
  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  }, [onDone])

  // Worked out on every render, never stored: a re-extract can change the
  // section's content while this panel stays open.
  const counts = countContent(unit.blocks, paper)
  const designCards = presetCardsFor(paper, counts)
  const ideaRows = ideaRowsFor(counts)

  const running = status?.status === "running"

  const readStatus = useCallback(async () => {
    try {
      const next = await createDesignApi.customTemplateStatus(cycleId, sectionCode, paper)
      // A run's progress lives in the memory of the server process running
      // it, and the backend runs several processes: a poll answered by
      // another one says "idle" while the run goes on. Dropping the run then
      // stopped the polling, and the PM never saw it finish. Keep showing it
      // until it says done or failed, or the screen gives up.
      setStatus((previous) =>
        previous?.status === "running" && next.status === "idle" ? previous : next)
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
    setReplacedText(null)
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

  /** Focus the request with the caret at the end, after this click has rendered. */
  const focusRequestEnd = () => {
    requestAnimationFrame(() => {
      const box = askRef.current
      if (!box) return
      box.focus()
      box.setSelectionRange(box.value.length, box.value.length)
      box.scrollTop = box.scrollHeight
    })
  }

  const typeInstructions = (value: string) => {
    setReplacedText(null)
    setInstructions(value.slice(0, MAX_CHARS))
  }

  /** A complete design replaces the request; Undo keeps the PM's own words. */
  const chooseDesign = (text: string) => {
    // Going from one design to the next keeps Undo pointing at what the PM
    // had written, not at the design they looked at first.
    const showingADesign = activeCardId(instructions, designCards) !== null
    if (!showingADesign) setReplacedText(instructions.trim() ? instructions : null)
    setInstructions(text)
    focusRequestEnd()
  }

  const undoDesign = () => {
    if (replacedText === null) return
    setInstructions(replacedText)
    setReplacedText(null)
    focusRequestEnd()
  }

  const changeIdeas = (next: string) => {
    setReplacedText(null)
    setInstructions(next)
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
                Say where things should go and how it should feel. Each sentence is
                checked against the printed pages, so one idea per sentence works best.
                Leave it empty and the designer picks a layout that suits this section.
              </p>
              <textarea
                id="custom-template-ask"
                ref={askRef}
                value={instructions}
                onChange={(e) => typeInstructions(e.target.value)}
                rows={5}
                placeholder={PLACEHOLDER}
                className="mt-3 w-full resize-y rounded-[10px] border border-slate-300 bg-white px-3 py-2.5 text-[13px] leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <div className="mt-1 flex items-center justify-end gap-3 text-[10.5px] text-slate-400">
                {replacedText !== null && (
                  <button
                    type="button"
                    onClick={undoDesign}
                    title="Bring back the text you had before this design"
                    className="inline-flex items-center gap-1 rounded-sm text-[11px] font-medium text-indigo-600 hover:text-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                  >
                    <Undo2 className="h-3 w-3" aria-hidden />
                    Undo
                  </button>
                )}
                <span className="tabular-nums">
                  {instructions.length} / {MAX_CHARS}
                </span>
              </div>

              <StartingPoints
                request={instructions}
                cards={designCards}
                rows={ideaRows}
                onChooseDesign={chooseDesign}
                onChangeIdeas={changeIdeas}
              />

              <div className="mt-6 rounded-[10px] border border-slate-200 bg-white p-4">
                <p className="text-[12px] font-semibold text-slate-900">What the designer lays out</p>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                  {contentFacts(counts).map((fact) => (
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
                  Usually 5–15 minutes: it checks the printed result against your
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

/**
 * "Need a starting point?": complete designs that fill in the whole request,
 * and single ideas that add (or take out) one sentence. Holds no state of its
 * own — what is chosen is read from the request itself, so typing over a
 * design or an idea simply un-highlights it.
 */
function StartingPoints({
  request,
  cards,
  rows,
  onChooseDesign,
  onChangeIdeas,
}: {
  request: string
  cards: PresetCard[]
  rows: IdeaRow[]
  onChooseDesign: (text: string) => void
  onChangeIdeas: (next: string) => void
}) {
  const activeId = activeCardId(request, cards)
  return (
    <section aria-labelledby="custom-template-starts" className="mt-4">
      <p id="custom-template-starts" className="text-[12px] font-semibold text-slate-900">
        Need a starting point?
      </p>
      <Tabs defaultValue="designs" className="mt-2">
        <TabsList className={TAB_LIST}>
          <TabsTrigger value="designs" className={TAB_TRIGGER}>Complete designs</TabsTrigger>
          <TabsTrigger value="ideas" className={TAB_TRIGGER}>Ideas to add</TabsTrigger>
        </TabsList>

        <TabsContent value="designs" className="mt-3">
          <p className="text-[11px] leading-snug text-slate-500">
            Fills in a complete request, written for this section&apos;s content. Change
            any of it before you start.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {cards.map((card) => {
              const active = card.id === activeId
              return (
                <button
                  key={card.id}
                  type="button"
                  aria-pressed={active}
                  title={card.text}
                  onClick={() => onChooseDesign(card.text)}
                  className={
                    `cursor-pointer ${TILE} border-2 px-3 py-2 text-left transition-colors ` +
                    (active
                      ? "border-[#6366F1] bg-[#EEF2FF]"
                      : "border-[#E2E8F0] bg-white hover:border-[#CBD5E1]")
                  }
                >
                  <span className={"block text-[12.5px] font-bold " + (active ? "text-[#3730A3]" : "text-[#0F172A]")}>
                    {card.name}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-[#64748B]">
                    {card.tagline}
                  </span>
                </button>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="ideas" className="mt-3">
          <p className="text-[11px] leading-snug text-slate-500">
            Each idea adds one sentence to your request. Click it again to take it out.
          </p>
          <div className="mt-2 space-y-3">
            {rows.map((row) => (
              <div key={row.id} role="group" aria-label={row.label}>
                <p className="text-[11px] font-medium text-slate-500">
                  {row.label}
                  {row.pickOne && <span className="font-normal text-slate-400"> · pick one</span>}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {row.ideas.map((idea) => {
                    const present = hasSentence(request, idea)
                    const next = toggleIdea(request, row, idea, MAX_CHARS)
                    return (
                      <button
                        key={idea}
                        type="button"
                        aria-pressed={present}
                        disabled={next === null}
                        title={next === null ? "No room left in the request for this idea" : undefined}
                        onClick={() => {
                          if (next !== null) onChangeIdeas(next)
                        }}
                        className={IDEA_CHIP + (present ? IDEA_CHIP_ON : IDEA_CHIP_OFF)}
                      >
                        {present && <Check className="mt-px h-3 w-3 shrink-0" aria-hidden />}
                        {idea}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </section>
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
          The designer hasn&apos;t finished in {GIVE_UP_MS / 60000} minutes. Your current
          template is unchanged. Try again, or come back later: if the run does
          finish, the new design appears on this section.
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
          : `${minutes}:${seconds} so far · usually 5–15 minutes`}
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
