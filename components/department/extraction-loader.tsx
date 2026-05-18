"use client"

import { useEffect, useState } from "react"
import {
  FileUp,
  ClipboardList,
  FileSearch,
  BrainCircuit,
  Sparkles,
  CheckCircle2,
} from "lucide-react"
import { cn } from "@/lib/utils"

export interface ExtractionResult {
  total_questions: number
  found_count: number
  not_found_count: number
}

const STAGES = [
  {
    icon: FileUp,
    title: "Uploading your documents",
    sub: "Securely sending your files into the workspace",
  },
  {
    icon: ClipboardList,
    title: "Reading your questions",
    sub: "Understanding what each question is really asking",
  },
  {
    icon: FileSearch,
    title: "Scanning your documents",
    sub: "Combing through every page for the relevant detail",
  },
  {
    icon: BrainCircuit,
    title: "Connecting the insights",
    sub: "Linking evidence across all of your documents",
  },
  {
    icon: Sparkles,
    title: "Finding the best answers",
    sub: "Drafting a tailored answer for every question",
  },
]

const STAGE_MS = 2600

/**
 * Full-screen animated loader shown while the backend uploads documents and
 * extracts answers for the department user. It cycles through friendly stage
 * messages while work runs; once `result` is supplied it flips to a success
 * state. The parent owns the redirect after a short celebratory pause.
 */
export function ExtractionLoader({ result }: { result: ExtractionResult | null }) {
  const [stage, setStage] = useState(0)
  const done = result !== null

  useEffect(() => {
    if (done) return
    const id = setInterval(() => {
      setStage((s) => (s < STAGES.length - 1 ? s + 1 : s))
    }, STAGE_MS)
    return () => clearInterval(id)
  }, [done])

  const current = STAGES[stage]
  const Icon = done ? CheckCircle2 : current.icon
  const title = done ? "All set — your answers are ready!" : current.title
  const sub = done
    ? `We drafted answers for ${result.found_count} of ${result.total_questions} question${
        result.total_questions === 1 ? "" : "s"
      }. Let's review them together.`
    : current.sub
  const progress = done ? 100 : Math.round(((stage + 1) / STAGES.length) * 100)
  const swapKey = done ? "done" : `stage-${stage}`

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <style>{`
        @keyframes el-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes el-pop { 0% { opacity: 0; transform: scale(0.6); } 60% { transform: scale(1.08); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes el-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-14px); } }
        @keyframes el-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
      `}</style>

      {/* ambient background glow */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-blue-200/40 blur-3xl animate-pulse" />
      <div
        className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-indigo-200/40 blur-3xl animate-pulse"
        style={{ animationDelay: "1.2s" }}
      />

      {/* floating sparkles */}
      {[
        { top: "18%", left: "21%", delay: "0s" },
        { top: "26%", left: "79%", delay: "0.6s" },
        { top: "72%", left: "17%", delay: "1.1s" },
        { top: "67%", left: "82%", delay: "1.6s" },
      ].map((p, i) => (
        <Sparkles
          key={i}
          className={cn(
            "pointer-events-none absolute h-4 w-4",
            done ? "text-emerald-300" : "text-blue-300"
          )}
          style={{
            top: p.top,
            left: p.left,
            animation: `el-float 3.4s ease-in-out infinite`,
            animationDelay: p.delay,
          }}
        />
      ))}

      {/* central orb */}
      <div className="relative h-44 w-44">
        <span
          className={cn(
            "absolute inset-0 rounded-full animate-ping",
            done ? "bg-emerald-400/20" : "bg-blue-400/20"
          )}
          style={{ animationDuration: "2.6s" }}
        />
        <span
          className={cn(
            "absolute inset-5 rounded-full animate-ping",
            done ? "bg-green-400/20" : "bg-indigo-400/20"
          )}
          style={{ animationDuration: "2.6s", animationDelay: "0.7s" }}
        />

        {done ? (
          <div className="absolute inset-3 rounded-full border-4 border-emerald-400" />
        ) : (
          <div
            className="absolute inset-3 rounded-full border-4 border-blue-100 border-t-blue-500 animate-spin"
            style={{ animationDuration: "2.4s" }}
          />
        )}

        <div
          className={cn(
            "absolute inset-7 flex items-center justify-center rounded-full shadow-xl transition-colors duration-500",
            done
              ? "bg-gradient-to-br from-emerald-500 to-green-600"
              : "bg-gradient-to-br from-blue-500 to-indigo-600"
          )}
        >
          <Icon
            key={swapKey}
            className="h-12 w-12 text-white"
            style={{ animation: "el-pop 0.5s ease-out" }}
          />
        </div>
      </div>

      {/* stage copy */}
      <div className="relative z-10 mt-12 max-w-md px-6 text-center">
        <h2
          key={`t-${swapKey}`}
          className="text-2xl font-bold text-slate-800"
          style={{ animation: "el-fade-up 0.5s ease-out" }}
        >
          {title}
        </h2>
        <p
          key={`s-${swapKey}`}
          className="mt-2 min-h-[3rem] text-sm text-slate-500"
          style={{ animation: "el-fade-up 0.6s ease-out" }}
        >
          {sub}
        </p>
      </div>

      {/* stage pips */}
      <div className="relative z-10 mt-6 flex items-center gap-2">
        {STAGES.map((_, i) => {
          const reached = done || i <= stage
          const active = !done && i === stage
          return (
            <span
              key={i}
              className={cn(
                "h-2 rounded-full transition-all duration-500",
                active ? "w-9" : "w-2.5",
                done ? "bg-emerald-400" : reached ? "bg-blue-500" : "bg-slate-200"
              )}
            />
          )
        })}
      </div>

      {/* progress bar */}
      <div className="relative z-10 mt-8 h-1.5 w-72 overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out",
            done
              ? "bg-gradient-to-r from-emerald-400 to-green-500"
              : "bg-gradient-to-r from-blue-400 to-indigo-500"
          )}
          style={{ width: `${progress}%` }}
        />
        {!done && (
          <div
            className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent"
            style={{ animation: "el-shimmer 1.6s ease-in-out infinite" }}
          />
        )}
      </div>
      <p className="relative z-10 mt-3 text-xs font-medium tracking-wide text-slate-400">
        {done ? "Complete" : `${progress}%`}
      </p>
    </div>
  )
}
