"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Loader2 } from "lucide-react"

/**
 * Full-screen "Building your outline" loader shown while the backend builds the
 * outline from the department's answers. Mirrors the kickoff build loader's
 * design (portal to <body>, simulated progress, rotating stages/tips) so the
 * two long-running AI waits feel consistent. The backend work isn't streamed,
 * so progress + stages are simulated on a timer to signal steady activity.
 */

// Outline pipeline stages, cycled as the simulated progress climbs.
const STAGES = [
  "Reading your answers…",
  "Grouping related answers…",
  "Identifying the key sections…",
  "Drafting headings & subheadings…",
  "Mapping answers to each section…",
  "Polishing the outline…",
]

// Playful "working" words that rotate under the stage line.
const WORKING_WORDS = [
  "Structuring",
  "Organizing",
  "Outlining",
  "Grouping",
  "Sequencing",
  "Refining",
]

// Rotating "Did you know?" facts shown in the footer card.
const TIPS = [
  "Your outline is built only from the answers you provided — nothing is invented.",
  "You can rename any heading or subheading, but the structure stays fixed.",
  "Each subheading maps to the specific answers it draws from.",
  "A clear outline helps the generated draft read better.",
]

export function OutlineBuildLoader() {
  const [progress, setProgress] = useState(8)
  const [wordIdx, setWordIdx] = useState(0)
  const [tipIdx, setTipIdx] = useState(0)

  // Simulated progress — climbs quickly early, eases off, then holds near the
  // end so a slow-but-healthy request never looks finished (or frozen).
  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 95) return 95
        const step = p < 55 ? 3 : p < 82 ? 1.4 : 0.5
        return Math.min(95, p + step)
      })
    }, 700)
    return () => clearInterval(id)
  }, [])

  // Rotate the playful working word and the footer tip on their own cadences.
  useEffect(() => {
    const id = setInterval(() => setWordIdx((i) => (i + 1) % WORKING_WORDS.length), 1800)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    const id = setInterval(() => setTipIdx((i) => (i + 1) % TIPS.length), 6500)
    return () => clearInterval(id)
  }, [])

  // Portals need the DOM. This loader only ever mounts client-side (the page
  // shows a PageLoader during SSR/initial load), so there's no hydration mismatch.
  if (typeof document === "undefined") return null

  const pct = Math.round(progress)
  const stageIdx = Math.min(STAGES.length - 1, Math.floor(progress / (100 / STAGES.length)))

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
        @keyframes obl-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* soft ambient corner glows */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-indigo-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 -top-32 h-96 w-96 rounded-full bg-violet-200/30 blur-3xl" />

      <div
        className="relative rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-xl"
        style={{ width: "100%", maxWidth: 440 }}
      >
        {/* AI orb with a rotating arc */}
        <div className="relative mx-auto h-16 w-16">
          <span className="absolute inset-0 rounded-full border-2 border-indigo-100" />
          <span
            className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-indigo-600"
            style={{ animationDuration: "1.1s" }}
          />
          <span className="absolute inset-0 flex items-center justify-center text-lg font-bold tracking-tight text-indigo-600">
            AI
          </span>
        </div>

        {/* heading + subtitle */}
        <h2 className="mt-5 text-xl font-bold text-indigo-700">Building your outline</h2>
        <p className="mt-1 text-xs text-slate-400">
          Sit tight while we shape headings and subheadings from your answers.
        </p>

        {/* current stage */}
        <p
          key={`stage-${stageIdx}`}
          className="mt-6 text-sm font-semibold text-slate-800"
          style={{ animation: "obl-fade 0.4s ease-out" }}
        >
          {STAGES[stageIdx]}
        </p>

        {/* playful working word */}
        <div className="mt-2 flex items-center justify-center gap-2 font-mono text-xs text-indigo-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span key={`word-${wordIdx}`} style={{ animation: "obl-fade 0.4s ease-out" }}>
            {WORKING_WORDS[wordIdx]}…
          </span>
        </div>

        {/* progress bar */}
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(to right, #6366f1, #3b82f6)",
            }}
          />
        </div>
        <p className="mt-2 font-mono text-xs text-slate-500">{pct}% complete</p>

        {/* Did you know? tip */}
        <div className="mt-6 flex items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-left">
          <span className="text-sm leading-5">💡</span>
          <p
            key={`tip-${tipIdx}`}
            className="text-xs leading-relaxed text-slate-500"
            style={{ animation: "obl-fade 0.4s ease-out" }}
          >
            <span className="font-semibold text-slate-700">Did you know?</span>{" "}
            {TIPS[tipIdx]}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
