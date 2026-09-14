"use client"

import { useMemo } from "react"
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
 * A transcription of Centrion_Frontend/src/components/quarterly/
 * TypographyControls.tsx, so this section reads identically in both apps.
 * Where a Tailwind class means something different under v4 the number is
 * written out instead — see the note on radii below.
 *
 * The ranges and the family list are the backend's, not suggestions: it
 * rejects anything outside them with a 422, so the field clamps rather than
 * let someone save a number that will bounce.
 *
 * There is deliberately no line-height control — the renderer fixes body line
 * height at 1.5 and ignores anything sent for it.
 */

// Centrion writes these as rounded-lg / rounded-md, which are 10px and 8px
// there (its live config derives the scale from --radius: .625rem) and 8px and
// 6px here (Tailwind v4, config not loaded). Stating the pixels is the only
// way the two surfaces actually match.
const ROW = "rounded-[10px]"
const FIELD = "rounded-[8px]"

type RoleKey = keyof Typography

const ROLE_LABEL: Record<RoleKey, string> = {
  heading: "Heading",
  subheading: "Subheading",
  body: "Body",
}

const WEIGHT_OPTIONS: { label: string; value: TypographyWeight }[] = [
  { label: "Regular", value: 400 },
  { label: "Bold", value: 700 },
]

/** The renderer accepts half-pixel sizes; the backend's ranges are integers. */
const STEP = 0.5

function rolesEqual(a: TypographyRole, b: TypographyRole): boolean {
  return a.family === b.family && a.size === b.size && a.weight === b.weight
}

/**
 * Field-wise rather than JSON.stringify: key order and any stray key on a
 * stored typography object would otherwise read as "customised" forever.
 */
export function hasCustomTypography(current: Typography, defaults: Typography): boolean {
  return !(
    rolesEqual(current.heading, defaults.heading)
    && rolesEqual(current.subheading, defaults.subheading)
    && rolesEqual(current.body, defaults.body)
  )
}

export function TypographyControls({ value, onChange, recommended, layoutName }: {
  value: Typography
  onChange: (next: Typography) => void
  /** The picked layout's recommended set — the target of "Reset". */
  recommended: Typography
  layoutName: string
}) {
  const customised = useMemo(
    () => hasCustomTypography(value, recommended),
    [value, recommended],
  )

  const setRole = (role: RoleKey, patch: Partial<TypographyRole>) =>
    onChange({ ...value, [role]: { ...value[role], ...patch } })

  return (
    <section aria-label="Typography">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#64748B]">
            Typography
          </span>
          <span className="text-[11px] text-[#94A3B8]">Recommended for {layoutName}</span>
          {customised && (
            <span
              className="ml-1 rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[10px] font-semibold text-[#4338CA]"
              aria-label="Custom typography values differ from the recommended defaults"
            >
              Customised
            </span>
          )}
        </div>
        {customised && (
          <button
            type="button"
            onClick={() => onChange(recommended)}
            className="cursor-pointer text-[11.5px] font-semibold text-[#4F46E5] hover:text-[#3730A3] hover:underline"
            aria-label={`Reset typography to ${layoutName}'s recommended defaults`}
          >
            Reset to recommended
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {(["heading", "subheading", "body"] as const).map((role) => {
          const spec = value[role]
          const [min, max] = SIZE_RANGES[role]
          return (
            <div
              key={role}
              // The stepper track is `auto`, not a fixed width: its contents run
              // to ~154px once the "14–22px" hint is counted, and a fixed track
              // clips the hint to "14-". The family column absorbs the change.
              className={`grid grid-cols-[80px_minmax(0,1fr)_auto_auto] items-center gap-2 ${ROW} border border-[#E2E8F0] bg-white px-3 py-2`}
            >
              <label className="text-[12px] font-semibold text-[#334155]">
                {ROLE_LABEL[role]}
              </label>

              <FamilySelect
                value={spec.family}
                onChange={(family) => setRole(role, { family })}
                fieldId={`typo-family-${role}`}
              />

              <SizeStepper
                value={spec.size}
                min={min}
                max={max}
                onChange={(size) => setRole(role, { size })}
                fieldId={`typo-size-${role}`}
              />

              <WeightSegment
                value={spec.weight}
                onChange={(weight) => setRole(role, { weight })}
                fieldId={`typo-weight-${role}`}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Sub-controls ─────────────────────────────────────────────────────

function FamilySelect({ value, onChange, fieldId }: {
  value: TypographyFamily
  onChange: (family: TypographyFamily) => void
  fieldId: string
}) {
  return (
    <select
      id={fieldId}
      value={value}
      onChange={(e) => onChange(e.target.value as TypographyFamily)}
      className={`${FIELD} border border-[#E2E8F0] bg-white px-2 py-1 text-[12px] text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#A5B4FC]`}
      aria-label="Font family"
    >
      {FAMILIES.map((f) => (
        // Each option renders in its own typeface, so the picker doubles as its
        // own preview. Only Plus Jakarta Sans and DM Mono are loaded in this
        // app, so today they all fall back to the system sans — Centrion
        // self-hosts the six report faces and this app does not yet.
        <option
          key={f.value}
          value={f.value}
          style={{ fontFamily: f.value === "DejaVu Sans" ? "sans-serif" : `'${f.value}', sans-serif` }}
        >
          {f.label}
        </option>
      ))}
    </select>
  )
}

function SizeStepper({ value, min, max, onChange, fieldId }: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  fieldId: string
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 2) / 2))
  const step = `${FIELD} h-7 w-6 cursor-pointer border border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F8FAFC] disabled:cursor-default disabled:opacity-40`

  return (
    <div className="flex items-center gap-1" aria-label={`Font size, between ${min} and ${max} pixels`}>
      <button
        type="button"
        onClick={() => onChange(clamp(value - STEP))}
        aria-label="Decrease size"
        disabled={value <= min}
        className={step}
      >
        −
      </button>
      <input
        id={fieldId}
        type="number"
        step={STEP}
        min={min}
        max={max}
        value={value}
        // Clamped on every keystroke, not just on blur, so the preview never
        // renders an out-of-range size and what reaches Apply is always valid.
        // The cost, inherited from the reference: you cannot type a size
        // digit-by-digit — typing "1" on the way to 18 snaps to the minimum.
        onChange={(e) => {
          const raw = e.target.value
          if (raw === "") return
          const n = Number(raw)
          if (Number.isFinite(n)) onChange(clamp(n))
        }}
        onBlur={(e) => onChange(clamp(Number(e.target.value) || min))}
        className={`w-12 ${FIELD} border border-[#E2E8F0] bg-white px-1 py-1 text-center text-[12px] text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#A5B4FC]`}
        aria-label="Size in pixels"
        title={`Between ${min} and ${max} px`}
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + STEP))}
        aria-label="Increase size"
        disabled={value >= max}
        className={step}
      >
        +
      </button>
      <span className="whitespace-nowrap text-[10px] text-[#94A3B8]" aria-hidden>
        {min}–{max}px
      </span>
    </div>
  )
}

function WeightSegment({ value, onChange, fieldId }: {
  value: TypographyWeight
  onChange: (v: TypographyWeight) => void
  fieldId: string
}) {
  return (
    <div
      role="group"
      aria-label="Font weight"
      id={fieldId}
      className={`inline-flex overflow-hidden ${FIELD} border border-[#E2E8F0] bg-white`}
    >
      {WEIGHT_OPTIONS.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={
              "cursor-pointer px-2.5 py-1 text-[11.5px] transition-colors "
              + (active ? "bg-[#EEF2FF] font-semibold text-[#4338CA]" : "text-[#64748B] hover:bg-[#F8FAFC]")
            }
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
