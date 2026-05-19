"use client"

import { useEffect, useState } from "react"
import {
  BookOpen,
  Target,
  Building2,
  PenLine,
  ListChecks,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  Sparkles,
  Lightbulb,
} from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Full-screen animated loader shown while the backend generates AI questions
 * from a kickoff brief. The work itself isn't streamed, so this walks through
 * believable pipeline stages on a timer — giving the PM a clear sense of what's
 * happening during a long (up to ~3 min) wait instead of a frozen spinner.
 *
 * Mounted while `submittingKickoff` is true and unmounted when it flips false.
 */

const STAGES = [
  {
    icon: BookOpen,
    title: "Reading your strategic brief",
    sub: "Understanding your priorities for this reporting cycle",
    pct: 14,
  },
  {
    icon: Target,
    title: "Identifying key themes & KPIs",
    sub: "Pulling out the focus areas worth reporting on",
    pct: 31,
  },
  {
    icon: Building2,
    title: "Mapping each department",
    sub: "Tailoring the angle to every department's role and goals",
    pct: 49,
  },
  {
    icon: PenLine,
    title: "Drafting tailored questions",
    sub: "Writing pointed questions for each department session",
    pct: 69,
  },
  {
    icon: ListChecks,
    title: "Polishing the question set",
    sub: "Refining wording and removing overlap",
    pct: 85,
  },
  {
    icon: ShieldCheck,
    title: "Final quality check",
    sub: "Making sure every question earns its place",
    pct: 95,
  },
]

// How long each stage is shown before advancing. The last stage is "sticky" —
// the timer stops there and reassurance copy rotates until the request returns.
const STAGE_MS = 9000

// Rotating reassurance lines shown once the walkthrough reaches the final stage.
const FINALIZING = [
  "Making sure every question earns its place",
  "Almost there — assembling the final question sets",
  "Quality-checking the wording across departments",
  "Hang tight — this can take a moment for larger cycles",
]

// Rotating tips at the foot of the screen — light reading during the wait.
const TIPS = [
  "A detailed strategic brief produces sharper, less generic questions.",
  "Every department gets its own tailored question set — never copy-pasted.",
  "You can review and edit every question once they're generated.",
  "Naming specific KPIs in your brief helps the AI ask measurable questions.",
  "Questions are written to draw out evidence, not just yes/no answers.",
]
const ROTATE_MS = 6500

export function KickoffLoader() {
  const [stage, setStage] = useState(0)
  const [finalIdx, setFinalIdx] = useState(0)
  const [tipIdx, setTipIdx] = useState(0)

  const lastStage = STAGES.length - 1
  const onFinalStage = stage === lastStage

  // Advance through the pipeline stages, then stop on the last one.
  useEffect(() => {
    if (onFinalStage) return
    const id = setInterval(
      () => setStage((s) => Math.min(s + 1, lastStage)),
      STAGE_MS
    )
    return () => clearInterval(id)
  }, [onFinalStage, lastStage])

  // Once on the final stage, rotate reassurance copy so it never looks frozen.
  useEffect(() => {
    if (!onFinalStage) return
    const id = setInterval(
      () => setFinalIdx((i) => (i + 1) % FINALIZING.length),
      4200
    )
    return () => clearInterval(id)
  }, [onFinalStage])

  // Rotate the bottom tips independently of the stage timer.
  useEffect(() => {
    const id = setInterval(() => setTipIdx((i) => (i + 1) % TIPS.length), ROTATE_MS)
    return () => clearInterval(id)
  }, [])

  const current = STAGES[stage]
  const Icon = current.icon
  const sub = onFinalStage ? FINALIZING[finalIdx] : current.sub
  const progress = current.pct
  const swapKey = `${stage}-${onFinalStage ? finalIdx : 0}`

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      <style>{`
        @keyframes kl-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes kl-pop { 0% { opacity: 0; transform: scale(0.6); } 60% { transform: scale(1.1); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes kl-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-14px); } }
        @keyframes kl-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(260%); } }
        @keyframes kl-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* ambient background glow */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-indigo-200/40 blur-3xl animate-pulse" />
      <div
        className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-blue-200/40 blur-3xl animate-pulse"
        style={{ animationDelay: "1.2s" }}
      />

      {/* floating sparkles */}
      {[
        { top: "16%", left: "20%", delay: "0s" },
        { top: "24%", left: "80%", delay: "0.6s" },
        { top: "74%", left: "16%", delay: "1.1s" },
        { top: "69%", left: "83%", delay: "1.6s" },
      ].map((p, i) => (
        <Sparkles
          key={i}
          className="pointer-events-none absolute h-4 w-4 text-indigo-300"
          style={{
            top: p.top,
            left: p.left,
            animation: "kl-float 3.4s ease-in-out infinite",
            animationDelay: p.delay,
          }}
        />
      ))}

      {/* central orb */}
      <div className="relative h-40 w-40">
        <span
          className="absolute inset-0 rounded-full bg-indigo-400/20 animate-ping"
          style={{ animationDuration: "2.6s" }}
        />
        <span
          className="absolute inset-5 rounded-full bg-blue-400/20 animate-ping"
          style={{ animationDuration: "2.6s", animationDelay: "0.7s" }}
        />
        <div
          className="absolute inset-3 rounded-full border-4 border-indigo-100 border-t-indigo-500 animate-spin"
          style={{ animationDuration: "2.4s" }}
        />
        <div className="absolute inset-7 flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 shadow-xl">
          <Icon
            key={swapKey}
            className="h-11 w-11 text-white"
            style={{ animation: "kl-pop 0.5s ease-out" }}
          />
        </div>
      </div>

      {/* heading */}
      <div className="relative z-10 mt-9 max-w-md px-6 text-center">
        <h2 className="text-2xl font-bold text-slate-800">Generating your questions</h2>
        <p
          key={`s-${swapKey}`}
          className="mt-1.5 min-h-[2.5rem] text-sm text-slate-500"
          style={{ animation: "kl-fade-up 0.5s ease-out" }}
        >
          {sub}
        </p>
      </div>

      {/* live step checklist — lets the PM watch the pipeline progress */}
      <div className="relative z-10 mt-7 w-[22rem] max-w-[90vw] rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm backdrop-blur">
        {STAGES.map((s, i) => {
          const done = i < stage
          const active = i === stage
          const StepIcon = s.icon
          return (
            <div
              key={i}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 transition-colors duration-500",
                active && "bg-indigo-50"
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors duration-500",
                  done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : active
                      ? "border-indigo-500 bg-white text-indigo-600"
                      : "border-slate-200 bg-white text-slate-300"
                )}
              >
                {done ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <StepIcon className="h-4 w-4" />
                )}
              </div>
              <span
                className={cn(
                  "text-sm transition-colors duration-500",
                  done
                    ? "font-medium text-slate-400 line-through decoration-slate-300"
                    : active
                      ? "font-semibold text-slate-800"
                      : "text-slate-400"
                )}
              >
                {s.title}
              </span>
            </div>
          )
        })}
      </div>

      {/* progress bar */}
      <div className="relative z-10 mt-6 h-1.5 w-[22rem] max-w-[90vw] overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-blue-500 transition-all duration-1000 ease-out"
          style={{ width: `${progress}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent"
          style={{ animation: "kl-shimmer 1.6s ease-in-out infinite" }}
        />
      </div>
      <p className="relative z-10 mt-2.5 text-xs font-medium tracking-wide text-slate-400">
        Please keep this window open — questions are on their way
      </p>

      {/* rotating tip */}
      <div className="relative z-10 mt-8 flex max-w-md items-center gap-2 rounded-full border border-indigo-100 bg-white/70 px-4 py-2 backdrop-blur">
        <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        <p
          key={`tip-${tipIdx}`}
          className="text-xs text-slate-500"
          style={{ animation: "kl-fade-up 0.5s ease-out" }}
        >
          {TIPS[tipIdx]}
        </p>
      </div>
    </div>
  )
}
