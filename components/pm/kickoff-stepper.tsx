"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

// Three again. They were collapsed to two when all three parts went to the
// client as one bundle -- splitting them then meant the client could only be
// shown half the work at a time. The client sign-off is two gates now: the
// brief goes out alone and, once it comes back approved, the areas of focus
// and concept messages are written FROM it and go out separately. Two gates,
// two screens.
const STEPS = [
  { n: 1, label: "Questionnaire" },
  { n: 2, label: "Strategic brief" },
  { n: 3, label: "Areas of focus" },
] as const

// Step 2's label depends on how many there are: on its own it is the brief,
// but when it also carries the areas it is the whole strategic direction.
const TWO_STEP_LABELS: Record<number, string> = { 2: "Strategic direction" }

export type KickoffStep = (typeof STEPS)[number]["n"]

/**
 * Progress indicator shared by the cycle-setup screens.
 */
export function KickoffStepper({
  current,
  steps = 3,
  compact = false,
}: {
  current: KickoffStep
  /** 2 for roles without the client sign-off: they keep the brief and the
   *  areas of focus on one screen, so there is no third step to point at. */
  steps?: 2 | 3
  /** Less vertical padding, for a screen that has to fit the window. */
  compact?: boolean
}) {
  const shown = STEPS.slice(0, steps)
  return (
    <div
      className={cn(
        "flex items-center rounded-2xl border bg-card px-5",
        compact ? "py-2" : "py-3.5",
      )}
    >
      {shown.map((s, i) => {
        const active = s.n === current
        const done = s.n < current
        const last = i === shown.length - 1
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
              {(steps === 2 && TWO_STEP_LABELS[s.n]) || s.label}
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
