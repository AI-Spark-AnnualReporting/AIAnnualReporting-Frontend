"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Loader2 } from "lucide-react"

/**
 * Full-screen "Building your intelligence dashboard" loader shown while the
 * kickoff pipeline generates each department's questions. The backend work
 * isn't streamed, so progress + stages are simulated on a timer to give the PM
 * a clear sense of activity during a long (up to ~3 min) wait.
 *
 * Rendered through a portal to <body> so it truly covers the viewport — a
 * plain `fixed inset-0` gets trapped by ancestors that establish a containing
 * block (the page's `overflow-y-auto` main + the sticky `backdrop-blur` footer),
 * which would otherwise clip it to a band. Critical layout (the overlay
 * background + card width) is set inline so it never depends on a utility class.
 */

// Pipeline stages, cycled as the simulated progress climbs. These mirror the
// kickoff question-generation flow: brief → themes → per-department → drafting →
// polishing → QA.
const STAGES = [
  "Reading your strategic brief…",
  "Identifying key themes & KPIs…",
  "Mapping each department's angle…",
  "Drafting tailored questions…",
  "Polishing the question set…",
  "Running a final quality check…",
]

// Playful "working" words that rotate under the stage line (à la Splunking…).
const WORKING_WORDS = [
  "Splunking",
  "Crunching",
  "Synthesizing",
  "Correlating",
  "Distilling",
  "Untangling",
]

// Rotating "Did you know?" facts shown in the footer card.
const TIPS = [
  "Your agents use GRI, IFRS, and SAMA frameworks to generate questions tailored to your sector.",
  "Every department gets its own tailored question set — never copy-pasted.",
  "Naming specific KPIs in your brief helps the AI ask measurable questions.",
  "You can review and edit every question once they're generated.",
]

export function KickoffBuildLoader() {
  const [mounted, setMounted] = useState(false)
  const [progress, setProgress] = useState(8)
  const [wordIdx, setWordIdx] = useState(0)
  const [tipIdx, setTipIdx] = useState(0)

  // Portals need the DOM — only render after mount (avoids SSR document access).
  useEffect(() => setMounted(true), [])

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

  if (!mounted) return null

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
        @keyframes kbl-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
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
        <h2 className="mt-5 text-xl font-bold text-indigo-700">
          Generating your questions
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Sit tight while we craft a tailored question set for every department.
        </p>

        {/* current stage */}
        <p
          key={`stage-${stageIdx}`}
          className="mt-6 text-sm font-semibold text-slate-800"
          style={{ animation: "kbl-fade 0.4s ease-out" }}
        >
          {STAGES[stageIdx]}
        </p>

        {/* playful working word */}
        <div className="mt-2 flex items-center justify-center gap-2 font-mono text-xs text-indigo-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span key={`word-${wordIdx}`} style={{ animation: "kbl-fade 0.4s ease-out" }}>
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
            style={{ animation: "kbl-fade 0.4s ease-out" }}
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
