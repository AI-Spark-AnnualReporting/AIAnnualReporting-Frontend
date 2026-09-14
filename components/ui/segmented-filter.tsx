"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

export interface SegmentedFilterOption {
  value: string
  label: string
  /** Shown as a badge inside the segment. Count the UNFILTERED list, so the
   *  numbers hold still while someone clicks between segments. */
  count: number
  /** Background utility for the pill when this segment is active. Defaults to
   *  the brand gradient. Pass the colour that already encodes this state
   *  elsewhere on the screen, so the rail and the content agree. */
  accent?: string
}

interface SegmentedFilterProps {
  options: SegmentedFilterOption[]
  value: string
  onChange: (value: string) => void
  className?: string
  "aria-label"?: string
}

const DEFAULT_ACCENT = "bg-gradient-to-r from-indigo-500 to-violet-500"

/**
 * Sliding segmented filter rail with per-segment counts — the filtering
 * counterpart to SortControl, and deliberately its twin: same rail, same
 * measured pill, same motion. The one thing it adds is that the pill takes the
 * colour of the state it selects, so sliding it from emerald to amber says what
 * you are now looking at before you read the label.
 *
 * Position is measured from the live DOM rather than computed, because the
 * count badges make every segment a different width.
 */
export function SegmentedFilter({
  options,
  value,
  onChange,
  className,
  "aria-label": ariaLabel = "Filter",
}: SegmentedFilterProps) {
  const railRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)

  const activeIndex = options.findIndex((o) => o.value === value)
  const accent = options[activeIndex]?.accent ?? DEFAULT_ACCENT

  // Re-measure after layout and on resize. The counts change as answers are
  // saved, which changes segment widths, so the option list is a dependency.
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
  }, [activeIndex, options])

  return (
    <div
      ref={railRef}
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 shadow-sm",
        className,
      )}
    >
      {/* Hidden until the first measurement, so it never flashes at x=0. */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-1 bottom-1 rounded-full shadow-sm",
          "transition-[transform,width,opacity] duration-300 ease-out motion-reduce:transition-none",
          accent,
          pill ? "opacity-100" : "opacity-0",
        )}
        style={pill ? { transform: `translateX(${pill.left}px)`, width: pill.width } : undefined}
      />
      {options.map((o, i) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              btnRefs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${o.label}, ${o.count}`}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-10 inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1",
              active ? "text-white" : "text-slate-600 hover:text-slate-900",
            )}
          >
            {o.label}
            <span
              className={cn(
                "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums transition-colors",
                active ? "bg-white/20 text-white" : "bg-slate-200/70 text-slate-600",
              )}
            >
              {o.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
