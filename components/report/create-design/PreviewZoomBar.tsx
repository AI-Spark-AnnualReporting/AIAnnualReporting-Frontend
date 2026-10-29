"use client"

/**
 * The zoom control: fit buttons, a stepper, and a box you can type into.
 *
 * 100% means the page filling the pane, so it is exactly the view the preview
 * opens on whatever the window size — and "Fit width" is therefore a reset
 * rather than a separate mode to reason about.
 *
 * The box commits on Enter and on blur, NOT on every keystroke. Clamping per
 * keystroke is what the typography stepper in this repo does, and its own
 * comment records the cost: typing "1" on the way to 150 snaps you to the
 * minimum and you can never get there.
 */

import { ChevronDown, Maximize2, Minus, MoveHorizontal, Plus } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/** The stops −/+ walk. A flat step is too coarse small and too fine large. */
export const LADDER = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4]
export const MIN_ZOOM = LADDER[0]
export const MAX_ZOOM = LADDER[LADDER.length - 1]

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

export const stepZoom = (z: number, dir: 1 | -1) => {
  if (dir === 1) return LADDER.find((s) => s > z + 0.001) ?? MAX_ZOOM
  return [...LADDER].reverse().find((s) => s < z - 0.001) ?? MIN_ZOOM
}

const pct = (z: number) => `${Math.round(z * 100)}%`

export function PreviewZoomBar({
  zoom,
  onZoom,
  onFitWidth,
  onFitPage,
}: {
  zoom: number
  onZoom: (z: number) => void
  onFitWidth: () => void
  onFitPage: () => void
}) {
  const [draft, setDraft] = useState(pct(zoom))

  // Follow the zoom while the box is not being edited. Typed text is not
  // overwritten mid-keystroke because commit happens on Enter or blur, and
  // both of those settle `zoom` first.
  useEffect(() => {
    setDraft(pct(zoom))
  }, [zoom])

  const commit = () => {
    const n = parseFloat(draft.replace("%", "").trim())
    // Nonsense reverts rather than resetting to a default — someone who typed
    // rubbish wants their old view back, not 100%.
    if (!Number.isFinite(n) || n <= 0) {
      setDraft(pct(zoom))
      return
    }
    onZoom(clampZoom(n / 100))
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-[11px]"
        onClick={onFitWidth}
        title="Fit the page to the width of the pane"
      >
        <MoveHorizontal className="mr-1 h-3.5 w-3.5" />
        Fit width
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-[11px]"
        onClick={onFitPage}
        title="Fit a whole page on screen"
      >
        <Maximize2 className="mr-1 h-3.5 w-3.5" />
        Fit page
      </Button>

      <div className="mx-1 h-5 w-px bg-slate-200" />

      <div className="flex items-center rounded-md border border-slate-200">
        <button
          type="button"
          onClick={() => onZoom(stepZoom(zoom, -1))}
          disabled={zoom <= MIN_ZOOM + 0.001}
          className="rounded-l-md px-1.5 py-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30"
          title="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
            if (e.key === "Escape") setDraft(pct(zoom))
            // The panel listens for these on the window; inside the box they
            // belong to the text, not to the view.
            e.stopPropagation()
          }}
          onBlur={commit}
          onFocus={(e) => e.target.select()}
          aria-label="Zoom"
          className="w-[52px] border-x border-slate-200 bg-transparent py-1 text-center text-[11px] tabular-nums text-slate-800 outline-none focus:bg-slate-50"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="px-1 py-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              title="Zoom presets"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[140px]">
            <DropdownMenuItem onSelect={onFitWidth}>Fit width</DropdownMenuItem>
            <DropdownMenuItem onSelect={onFitPage}>Fit page</DropdownMenuItem>
            <DropdownMenuSeparator />
            {[0.5, 0.75, 1, 1.5, 2, 3, 4].map((z) => (
              <DropdownMenuItem key={z} onSelect={() => onZoom(z)}>
                {pct(z)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={() => onZoom(stepZoom(zoom, 1))}
          disabled={zoom >= MAX_ZOOM - 0.001}
          className="rounded-r-md px-1.5 py-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30"
          title="Zoom in"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
