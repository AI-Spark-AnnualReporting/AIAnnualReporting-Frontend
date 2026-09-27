"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Check, Info } from "lucide-react"

/* Full-screen loader for the draft analysis.
 *
 * The analysis is one model call per department, fired together — roughly ten
 * to thirty seconds. Long enough that a spinning button reads as frozen, so
 * this narrates the pipeline instead.
 *
 * The work is not streamed, so the stages walk on a timer. The percentage is
 * therefore an honest estimate, not a measurement — it never reaches 100 until
 * the request actually returns, so the screen can't claim to be finished while
 * the slowest department is still being read.
 *
 * Rendered through a portal to <body> so it truly covers the viewport: a plain
 * `fixed inset-0` gets trapped by any ancestor that establishes a containing
 * block, which would clip it to a band.
 */

const STAGES = [
  { label: "Reading each department's draft", pct: 22 },
  { label: "Checking each sentence against its own facts", pct: 48 },
  { label: "Comparing figures between departments", pct: 74 },
  { label: "Collecting what needs your attention", pct: 92 },
]

const SUBTITLES = [
  "Splitting every approved section into sentences.",
  "Looking for claims the department's answers don't support.",
  "Finding numbers that disagree between departments.",
  "Putting the findings together.",
]

const TIPS = [
  "Drafts are written from each department's answers alone — anything else was added by the AI.",
  "Only company-wide figures are compared between departments.",
  "Editing a sentence here rewrites it in that department's submitted report.",
  "“Looks right” clears a finding without changing any text.",
]

const STAGE_MS = 3200
const TIP_MS = 5000

export function DraftCheckLoader() {
  const [stage, setStage] = useState(0)
  const [tip, setTip] = useState(0)

  // Stops on the last stage rather than looping. The bar parks just short of
  // full and waits — better than a bar that completes while the work has not.
  useEffect(() => {
    if (stage >= STAGES.length - 1) return
    const t = setTimeout(() => setStage((s) => s + 1), STAGE_MS)
    return () => clearTimeout(t)
  }, [stage])

  useEffect(() => {
    const t = setInterval(() => setTip((i) => (i + 1) % TIPS.length), TIP_MS)
    return () => clearInterval(t)
  }, [])

  // Portals need the DOM. A guard rather than mount state: this only ever
  // renders after the PM clicks Analyze, so it never exists during SSR and
  // there is no hydration boundary to straddle.
  if (typeof document === "undefined") return null

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div className="w-full max-w-lg text-center">
        <BrandMark />

        <h2 className="mt-6 text-2xl font-extrabold tracking-tight text-[#1A1D2E]">
          Analyzing department drafts
        </h2>
        <p className="mt-2 text-sm text-slate-500">{SUBTITLES[stage]}</p>

        <div className="mt-7 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-[#4040c8] transition-all duration-700 ease-out"
            style={{ width: `${STAGES[stage].pct}%` }}
          />
        </div>
        <p className="mt-2 text-xs font-medium text-slate-400">
          {STAGES[stage].pct}% complete
        </p>

        <ul className="mt-7 space-y-3 text-left">
          {STAGES.map((s, i) => (
            <Step
              key={s.label}
              label={s.label}
              state={i < stage ? "done" : i === stage ? "active" : "todo"}
            />
          ))}
        </ul>

        <div className="mt-8 flex items-start gap-2.5 rounded-xl bg-slate-50 px-4 py-3 text-left">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p className="text-xs leading-relaxed text-slate-500">{TIPS[tip]}</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* Concentric rings with one arc turning, so the screen is visibly alive even
   while a stage sits still for three seconds. */
function BrandMark() {
  return (
    <div className="flex flex-col items-center">
      <div className="relative flex h-28 w-28 items-center justify-center">
        <span className="absolute inset-0 rounded-full border border-slate-100" />
        <span className="absolute inset-3 rounded-full border border-slate-100" />
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[#4040c8] [animation-duration:1.6s]" />
        {/* The Centriyon mark itself, not a lookalike: four squares with two
            at reduced opacity. A grid icon from the icon set has four equal
            squares and reads as a different logo. */}
        <svg viewBox="0 0 32 32" className="h-12 w-12" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="#4040C8" />
          <g transform="translate(6.7 6.7) scale(1.4286)">
            <rect x=".5" y=".5" width="5.5" height="5.5" rx="1" fill="#fff" />
            <rect x="8" y=".5" width="5.5" height="5.5" rx="1" fill="#fff" opacity=".4" />
            <rect x=".5" y="8" width="5.5" height="5.5" rx="1" fill="#fff" opacity=".4" />
            <rect x="8" y="8" width="5.5" height="5.5" rx="1" fill="#fff" />
          </g>
        </svg>
      </div>
      <p className="mt-3 text-[11px] font-semibold tracking-[0.25em] text-slate-400">
        CENTRIYON
      </p>
    </div>
  )
}

function Step({
  label,
  state,
}: {
  label: string
  state: "done" | "active" | "todo"
}) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {state === "done" ? (
          <Check className="h-4 w-4 text-emerald-500" strokeWidth={3} />
        ) : state === "active" ? (
          <span className="h-2.5 w-2.5 rounded-full bg-[#4040c8]" />
        ) : (
          <span className="h-2.5 w-2.5 rounded-full border border-slate-300" />
        )}
      </span>
      <span
        className={
          state === "done"
            ? "text-sm font-semibold text-emerald-600"
            : state === "active"
              ? "text-sm font-bold text-[#1A1D2E]"
              : "text-sm text-slate-400"
        }
      >
        {label}
      </span>
    </li>
  )
}
