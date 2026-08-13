"use client"

import { Star } from "lucide-react"
import { type AreaRole } from "@/lib/areasOfFocus"
import { cn } from "@/lib/utils"

/**
 * The primary/secondary either-or control shared by the areas-of-focus cards
 * and the concept-message cards.
 *
 * Native inputs on purpose: a radio group gives "one primary across the whole
 * list" for free (hence the shared `group` name), and a checkbox gives an
 * unmarkable secondary. Clearing the checkbox sets "none" — not carried forward.
 */
export function RoleToggle({
  role,
  group,
  onChange,
  className,
}: {
  role: AreaRole
  /** Shared across every card in one list so the radios are mutually exclusive. */
  group: string
  onChange: (role: AreaRole) => void
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-4", className)}>
      <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-foreground">
        <input
          type="radio"
          name={group}
          checked={role === "primary"}
          onChange={() => onChange("primary")}
          className="h-3.5 w-3.5 cursor-pointer accent-indigo-600"
        />
        <Star
          className={cn(
            "h-3 w-3",
            role === "primary" ? "fill-indigo-600 text-indigo-600" : "text-muted-foreground",
          )}
        />
        Primary
      </label>
      <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-foreground">
        <input
          type="checkbox"
          checked={role === "secondary"}
          onChange={(e) => onChange(e.target.checked ? "secondary" : "none")}
          className="h-3.5 w-3.5 cursor-pointer accent-indigo-600"
        />
        Secondary
      </label>
    </div>
  )
}
