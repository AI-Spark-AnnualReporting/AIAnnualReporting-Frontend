"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { ArrowDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SortState } from "@/lib/sort"

interface SortControlProps {
  /** Fields to render — order is preserved left→right. */
  fields: { key: string; label: string }[]
  /** Active field + direction (from useSort). */
  value: SortState
  /** Click a segment: same field ⇒ flip direction, other field ⇒ switch. */
  onSelect: (key: string) => void
  size?: "sm" | "md"
  className?: string
  "aria-label"?: string
}

/**
 * Sliding segmented "Sort by" rail. A brand-gradient pill slides behind the
 * active field (position measured from the live DOM so unequal label widths
 * line up); the active field carries a direction arrow that rotates ↓/↑.
 * Not a dropdown. No animation library — pure CSS transform + transition.
 */
export function SortControl({
  fields,
  value,
  onSelect,
  size = "md",
  className,
  "aria-label": ariaLabel = "Sort by",
}: SortControlProps) {
  const railRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)

  const activeIndex = fields.findIndex((f) => f.key === value.key)

  // Measure the active segment after layout (and on resize) so the pill tracks
  // the real geometry. Re-runs whenever the active field or direction changes —
  // the arrow toggles segment widths, so positions shift and need re-measuring.
  useLayoutEffect(() => {
    const measure = () => {
      const btn = btnRefs.current[activeIndex]
      if (!btn) return
      setPill({ left: btn.offsetLeft, width: btn.offsetWidth })
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (railRef.current) ro.observe(railRef.current)
    return () => ro.disconnect()
  }, [activeIndex, value.direction, fields])

  const pad = size === "sm" ? "px-3 py-1.5" : "px-3.5 py-2"
  const text = size === "sm" ? "text-xs" : "text-sm"

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="hidden text-xs font-medium text-slate-400 sm:inline">Sort</span>
      <div
        ref={railRef}
        role="radiogroup"
        aria-label={ariaLabel}
        className="relative inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 shadow-sm"
      >
        {/* Sliding gradient pill — hidden until the first measurement to avoid a flash. */}
        <span
          aria-hidden
          className={cn(
            "absolute left-0 top-1 bottom-1 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 shadow-sm",
            "transition-[transform,width,opacity] duration-300 ease-out motion-reduce:transition-none",
            pill ? "opacity-100" : "opacity-0",
          )}
          style={
            pill
              ? { transform: `translateX(${pill.left}px)`, width: pill.width }
              : undefined
          }
        />
        {fields.map((f, i) => {
          const active = f.key === value.key
          return (
            <button
              key={f.key}
              ref={(el) => {
                btnRefs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={
                active
                  ? `Sort by ${f.label}, ${value.direction === "asc" ? "ascending" : "descending"}`
                  : `Sort by ${f.label}`
              }
              onClick={() => onSelect(f.key)}
              className={cn(
                "relative z-10 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-colors",
                pad,
                text,
                active ? "text-white" : "text-slate-600 hover:text-slate-900",
              )}
            >
              {f.label}
              {active && (
                <ArrowDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none",
                    value.direction === "asc" && "rotate-180",
                  )}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
