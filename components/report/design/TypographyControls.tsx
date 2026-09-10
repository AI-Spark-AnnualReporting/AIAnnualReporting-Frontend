"use client"

import { Minus, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  FAMILIES,
  SIZE_RANGES,
  type Typography,
  type TypographyFamily,
  type TypographyRole,
  type TypographyWeight,
} from "@/types/report-design"

/**
 * Family, size and weight for each of the three text roles.
 *
 * The ranges and the family list are the backend's, not suggestions: it rejects
 * anything outside them with a 422, so the steppers clamp rather than let
 * someone save a number that will bounce.
 *
 * There is deliberately no line-height control — the renderer fixes body line
 * height at 1.5 and ignores anything sent for it.
 */

const ROLES: { key: keyof Typography; label: string }[] = [
  { key: "heading", label: "Headings" },
  { key: "subheading", label: "Subheads" },
  { key: "body", label: "Body" },
]

function clamp(value: number, [min, max]: [number, number]): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, Math.round(value * 2) / 2))
}

function SizeStepper({ role, value, onChange }: {
  role: keyof Typography
  value: number
  onChange: (n: number) => void
}) {
  const range = SIZE_RANGES[role]
  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="outline" size="icon" className="h-7 w-7"
              aria-label="Smaller"
              disabled={value <= range[0]}
              onClick={() => onChange(clamp(value - 0.5, range))}>
        <Minus className="h-3 w-3" />
      </Button>
      <span className="w-10 text-center text-xs tabular-nums">{value}px</span>
      <Button type="button" variant="outline" size="icon" className="h-7 w-7"
              aria-label="Larger"
              disabled={value >= range[1]}
              onClick={() => onChange(clamp(value + 0.5, range))}>
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  )
}

export function TypographyControls({ value, onChange, recommended, layoutName }: {
  value: Typography
  onChange: (next: Typography) => void
  /** The picked layout's recommended set — the target of "Reset". */
  recommended: Typography
  layoutName: string
}) {
  const customised = JSON.stringify(value) !== JSON.stringify(recommended)

  const setRole = (role: keyof Typography, patch: Partial<TypographyRole>) =>
    onChange({ ...value, [role]: { ...value[role], ...patch } })

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Typography
          </h3>
          {customised && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px]
                             font-semibold text-amber-800">
              Customised
            </span>
          )}
        </div>
        {customised && (
          <button type="button"
                  className="text-xs font-medium text-brand hover:underline"
                  onClick={() => onChange(recommended)}>
            Reset to {layoutName}&rsquo;s type
          </button>
        )}
      </div>

      <div className="space-y-2">
        {ROLES.map(({ key, label }) => (
          <div key={key} className="grid grid-cols-[70px_1fr_auto_auto] items-center gap-2">
            <span className="text-xs text-muted-foreground">{label}</span>

            <select
              aria-label={`${label} font`}
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
              value={value[key].family}
              onChange={(e) => setRole(key, { family: e.target.value as TypographyFamily })}
            >
              {FAMILIES.map((f) => (
                // Each option previews its own face, so the list is browsable
                // without applying anything.
                <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                  {f.label}
                </option>
              ))}
            </select>

            <SizeStepper role={key} value={value[key].size}
                         onChange={(size) => setRole(key, { size })} />

            <div className="flex overflow-hidden rounded-md border">
              {([400, 700] as TypographyWeight[]).map((w) => (
                <button key={w} type="button"
                        onClick={() => setRole(key, { weight: w })}
                        className={cn(
                          "px-2 py-1 text-xs transition-colors",
                          value[key].weight === w
                            ? "bg-brand text-brand-foreground"
                            : "bg-background hover:bg-accent",
                        )}>
                  {w === 400 ? "Regular" : "Bold"}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
