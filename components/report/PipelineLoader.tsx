"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

/* Full-screen loader for a multi-step AI run.
 *
 * Shares the shell every other build loader in this app uses — gradient ground,
 * ambient corner glows, one white card — so a PM who has waited through the
 * kickoff or the draft build recognises this as the same product doing the same
 * kind of work.
 *
 * None of this work is streamed, so the stages walk on a timer. There is
 * deliberately no percentage: a number implies measurement, and inventing one
 * for work we cannot observe is a smaller lie than it looks but a lie all the
 * same. The checklist says what is happening, which is what the wait is for.
 *
 * Rendered through a portal to <body> so it truly covers the viewport — a plain
 * `fixed inset-0` gets trapped by any ancestor that establishes a containing
 * block, which would clip it to a band.
 */

export interface PipelineStage {
  /** The checklist line. */
  label: string
  /** What the card says while this stage is current. */
  subtitle: string
  /** Kept for callers; unused now the bar is gone. */
  pct?: number
}

const TIP_MS = 5000
const FINALIZING_MS = 4500

// Shown once the walkthrough reaches its last stage and the timer stops. The
// stages are a guess at the pace; the request is the truth, and it routinely
// outlasts them — 35 and 42 seconds against a 30-second walkthrough on real
// reports. Without these the card simply goes quiet at the end, which reads as
// frozen precisely when the PM has waited longest.
const FINALIZING = [
  "Almost there — putting the findings together.",
  "This takes a little longer on a long report.",
  "Still working — nearly done.",
]

export function PipelineLoader({
  title,
  stages,
  tips,
  stageMs = 3200,
}: {
  title: string
  stages: PipelineStage[]
  tips: string[]
  /** How long each stage holds. Roughly total runtime ÷ stages. */
  stageMs?: number
}) {
  const [stage, setStage] = useState(0)
  const [tip, setTip] = useState(0)
  const [finalizing, setFinalizing] = useState(-1)

  useEffect(() => {
    if (stage >= stages.length - 1) return
    const t = setTimeout(() => setStage((s) => s + 1), stageMs)
    return () => clearTimeout(t)
  }, [stage, stages.length, stageMs])

  // On the last stage the walkthrough has nothing left to say, so it starts
  // reassuring instead of going silent.
  useEffect(() => {
    if (stage < stages.length - 1) return
    const t = setInterval(
      () => setFinalizing((i) => Math.min(i + 1, FINALIZING.length - 1)),
      FINALIZING_MS,
    )
    return () => clearInterval(t)
  }, [stage, stages.length])

  useEffect(() => {
    if (tips.length < 2) return
    const t = setInterval(() => setTip((i) => (i + 1) % tips.length), TIP_MS)
    return () => clearInterval(t)
  }, [tips.length])

  // Portals need the DOM. A guard rather than mount state: these only render
  // once work is under way, so they never exist during SSR and there is no
  // hydration boundary to straddle.
  if (typeof document === "undefined") return null

  return createPortal(
    <div
      className="flex items-center justify-center p-4"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        overflow: "hidden",
        background: "linear-gradient(to bottom, #ffffff 0%, #ffffff 55%, #eef2ff 100%)",
      }}
    >
      <style>{`
        @keyframes pl-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* soft ambient corner glows */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-indigo-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 -top-32 h-96 w-96 rounded-full bg-violet-200/30 blur-3xl" />

      <div
        className="relative rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-xl"
        style={{ width: "100%", maxWidth: 440 }}
      >
        <BrandMark />

        <h2 className="mt-4 text-xl font-bold text-[#1A1D2E]">{title}</h2>
        <p
          key={`sub-${stage}-${finalizing}`}
          className="mt-1 text-xs leading-relaxed text-slate-400"
          style={{ animation: "pl-fade 0.4s ease-out" }}
        >
          {finalizing >= 0 ? FINALIZING[finalizing] : stages[stage].subtitle}
        </p>

        <ul className="mt-6 space-y-3 rounded-xl bg-slate-50/80 px-4 py-4 text-left">
          {stages.map((s, i) => (
            <Step
              key={s.label}
              label={s.label}
              state={i < stage ? "done" : i === stage ? "active" : "todo"}
            />
          ))}
        </ul>

        {tips.length > 0 && (
          <div className="mt-6 flex items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-left">
            <span className="text-sm leading-5">💡</span>
            <p
              key={`tip-${tip}`}
              className="text-xs leading-relaxed text-slate-500"
              style={{ animation: "pl-fade 0.4s ease-out" }}
            >
              <span className="font-semibold text-slate-700">Did you know?</span>{" "}
              {tips[tip]}
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* A ring with one arc turning, so the card is visibly alive even while a stage
   sits still for several seconds. */
function BrandMark() {
  return (
    <div className="flex flex-col items-center">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-2 border-indigo-100" />
        <span
          className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[#4040c8]"
          style={{ animationDuration: "1.1s" }}
        />
        {/* The Centriyon mark itself, not a lookalike: four squares with two at
            reduced opacity. A grid icon from the icon set has four equal squares
            and reads as a different logo. */}
        <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="#4040C8" />
          <g transform="translate(6.7 6.7) scale(1.4286)">
            <rect x=".5" y=".5" width="5.5" height="5.5" rx="1" fill="#fff" />
            <rect x="8" y=".5" width="5.5" height="5.5" rx="1" fill="#fff" opacity=".4" />
            <rect x=".5" y="8" width="5.5" height="5.5" rx="1" fill="#fff" opacity=".4" />
            <rect x="8" y="8" width="5.5" height="5.5" rx="1" fill="#fff" />
          </g>
        </svg>
      </div>
      <p className="mt-2 text-[10px] font-semibold tracking-[0.25em] text-slate-400">
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
        <span
          className={
            state === "done"
              ? "h-2.5 w-2.5 rounded-full bg-[#4040c8]"
              : state === "active"
                ? "h-2.5 w-2.5 rounded-full bg-[#7c7ce0] ring-4 ring-[#7c7ce0]/20"
                : "h-2.5 w-2.5 rounded-full bg-slate-200"
          }
        />
      </span>
      <span
        className={
          state === "todo"
            ? "text-sm text-slate-400"
            : state === "active"
              ? "text-sm font-semibold text-[#1A1D2E]"
              : "text-sm text-slate-500"
        }
      >
        {label}
      </span>
    </li>
  )
}
