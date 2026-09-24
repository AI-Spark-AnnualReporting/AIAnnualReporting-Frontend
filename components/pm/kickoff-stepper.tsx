"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

// Two, not three. The brief, the areas of focus and the concept messages were
// split across two screens while the messages were written from the finished
// areas. They are one card each now, written in the same run, so splitting them
// only meant the client could not be shown the whole thing at once.
const STEPS = [
  { n: 1, label: "Questionnaire" },
  { n: 2, label: "Strategic direction" },
] as const

export type KickoffStep = (typeof STEPS)[number]["n"]

/**
 * Progress indicator shared by the cycle-setup screens.
 */
export function KickoffStepper({ current }: { current: KickoffStep }) {
  return (
    <div className="flex items-center rounded-2xl border bg-card px-5 py-3.5">
      {STEPS.map((s, i) => {
        const active = s.n === current
        const done = s.n < current
        const last = i === STEPS.length - 1
        return (
          <div key={s.n} className={cn("flex items-center", !last && "flex-1")}>
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                active
                  ? "bg-indigo-600 text-white"
                  : done
                    ? "bg-green-500 text-white"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : s.n}
            </span>
            <span
              className={cn(
                "ml-2 whitespace-nowrap text-sm font-medium",
                active || done ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
            {!last && (
              <div className={cn("mx-4 h-px flex-1", current > s.n ? "bg-green-400" : "bg-border")} />
            )}
          </div>
        )
      })}
    </div>
  )
}
