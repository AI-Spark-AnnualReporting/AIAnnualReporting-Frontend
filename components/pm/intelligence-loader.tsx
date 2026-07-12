"use client"

import { useEffect, useState } from "react"
import { Lightbulb } from "lucide-react"

/**
 * Full-screen loader shown after the PM approves the strategic brief and sets
 * the questions deadline, while the backend generates AI questions for every
 * department (POST /pm/kickoff). This is a one-time kickoff step, so it gets a
 * dedicated "Building your intelligence dashboard" screen.
 *
 * The kickoff call isn't streamed, so progress is a believable self-driven
 * ramp that eases toward ~95% and sticks there until the request returns and
 * the parent unmounts this on redirect. The sub-status word and the tip rotate
 * on their own timers so the screen never looks frozen during the long wait.
 *
 * Mounted while the parent's `generating` flag is true; unmounted on redirect.
 */

// Rotating sub-status shown under the active stage line.
const SUBSTATUS = [
  "Splunking…",
  "Reading…",
  "Connecting the insights…",
  "Mapping each department…",
  "Drafting tailored questions…",
]
const SUBSTATUS_MS = 2200

// Rotating "Did you know?" tips at the foot of the card.
const TIPS = [
  "Your agents use GRI, IFRS, and SAMA frameworks to generate questions tailored to your sector.",
  "Every department gets its own tailored question set — never copy-pasted.",
  "Questions are written to draw out evidence, not just yes/no answers.",
  "You can review and edit every question once they're generated.",
]
const TIP_MS = 6500

export function IntelligenceLoader() {
  const [subIdx, setSubIdx] = useState(0)
  const [tipIdx, setTipIdx] = useState(0)
  const [progress, setProgress] = useState(8)

  const pct = Math.round(progress)

  // Self-driven progress: ease toward ~95% with diminishing steps so it feels
  // alive during the long kickoff call, then stick until the parent redirects.
  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => (p >= 95 ? 95 : p + (95 - p) * 0.06))
    }, 700)
    return () => clearInterval(id)
  }, [])

  // Rotate the sub-status word.
  useEffect(() => {
    const id = setInterval(() => setSubIdx((i) => (i + 1) % SUBSTATUS.length), SUBSTATUS_MS)
    return () => clearInterval(id)
  }, [])

  // Rotate the bottom tip independently.
  useEffect(() => {
    const id = setInterval(() => setTipIdx((i) => (i + 1) % TIPS.length), TIP_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-indigo-50 p-6">
      <style>{`
        @keyframes il-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes il-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(260%); } }
        @keyframes il-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* ambient background glow */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-indigo-200/40 blur-3xl animate-pulse" />
      <div
        className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-blue-200/40 blur-3xl animate-pulse"
        style={{ animationDelay: "1.2s" }}
      />

      {/* centered card */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white/90 px-8 py-10 text-center shadow-xl backdrop-blur">
        {/* AI orb with animated ring */}
        <div className="relative mx-auto h-24 w-24">
          <span
            className="absolute inset-0 rounded-full border-4 border-indigo-100 border-t-indigo-500"
            style={{ animation: "il-orbit 1.6s linear infinite" }}
          />
          <div className="absolute inset-3 flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 shadow-lg">
            <span className="text-lg font-bold tracking-wide text-white">AI</span>
          </div>
        </div>

        <h2 className="mt-6 text-xl font-bold text-indigo-700">
          Building your intelligence dashboard
        </h2>
        <p className="mt-1.5 text-sm text-slate-500">
          We only do this once — sit tight while we read your reports.
        </p>

        {/* active stage + rotating sub-status */}
        <p className="mt-7 text-sm font-semibold text-slate-800">
          Reading your uploaded reports…
        </p>
        <p
          key={subIdx}
          className="mt-1 text-sm font-medium text-indigo-600"
          style={{ animation: "il-fade-up 0.5s ease-out" }}
        >
          {SUBSTATUS[subIdx]}
        </p>

        {/* progress bar */}
        <div className="relative mt-5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-blue-500 transition-all duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
          <div
            className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent"
            style={{ animation: "il-shimmer 1.6s ease-in-out infinite" }}
          />
        </div>
        <p className="mt-2.5 text-xs font-medium tracking-wide text-slate-500">
          {pct}% complete
        </p>

        {/* rotating tip */}
        <div className="mt-8 flex items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-left">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p
            key={tipIdx}
            className="text-xs leading-relaxed text-slate-600"
            style={{ animation: "il-fade-up 0.5s ease-out" }}
          >
            <span className="font-semibold text-slate-700">Did you know?</span>{" "}
            {TIPS[tipIdx]}
          </p>
        </div>
      </div>
    </div>
  )
}
