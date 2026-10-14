"use client"

/**
 * The Portrait (A4) | Landscape (A4) | Presentation (16:9) switch in the
 * Create Design header.
 *
 * Labelled in words as well as icons, and given its own caption, because it
 * sits in a header of ghost buttons and the first person to look for it could
 * not find it. It is a report-level setting: it decides which of the two sets
 * of page picks the screen shows and the export prints. Neither set is ever
 * thrown away, so flipping back finds exactly what was there. The two
 * landscape buttons share one set of picks — they differ only in the sheet.
 */

import { Loader2, Presentation, RectangleHorizontal, RectangleVertical } from "lucide-react"

import { PAGE_FORMAT_LABELS, type PageFormat } from "@/lib/orientation"
import { cn } from "@/lib/utils"

const LOCKED_TITLE = "This report is approved and locked"

/** One segment of the switch. */
function OrientationButton({
  label,
  icon: Icon,
  pressed,
  disabled,
  title,
  onClick,
}: {
  label: string
  icon: typeof RectangleVertical
  pressed: boolean
  disabled: boolean
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded px-2.5 text-[12px] font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-60",
        pressed
          ? "bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-200"
          : "text-slate-600 hover:text-slate-900",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

/**
 * Pick the report's page format.
 *
 * @param value     the saved format
 * @param onChange  called with another format; never with the current one
 * @param disabled  true while the design record loads, while saving, or when locked
 * @param saving    true while a switch is being saved, to show it is working
 * @param locked    true when the report is approved; explains the disabled state
 */
export function OrientationToggle({
  value,
  onChange,
  disabled,
  saving,
  locked = false,
}: {
  value: PageFormat
  onChange: (next: PageFormat) => void
  disabled: boolean
  saving: boolean
  locked?: boolean
}) {
  /** Ignore a click on the button that is already selected. */
  const choose = (next: PageFormat) => {
    if (next !== value) onChange(next)
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-[11px] font-medium text-slate-500">Page format</span>
      <div
        role="group"
        aria-label="Page format"
        className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-100 p-0.5"
      >
        <OrientationButton
          label={PAGE_FORMAT_LABELS.portrait}
          icon={RectangleVertical}
          pressed={value === "portrait"}
          disabled={disabled}
          title={locked ? LOCKED_TITLE : "Upright A4 pages"}
          onClick={() => choose("portrait")}
        />
        <OrientationButton
          label={PAGE_FORMAT_LABELS.landscape}
          icon={RectangleHorizontal}
          pressed={value === "landscape"}
          disabled={disabled}
          title={locked ? LOCKED_TITLE : "Sideways A4 pages"}
          onClick={() => choose("landscape")}
        />
        <OrientationButton
          label={PAGE_FORMAT_LABELS.presentation}
          icon={Presentation}
          pressed={value === "presentation"}
          disabled={disabled}
          title={locked ? LOCKED_TITLE : "Widescreen slides, the size of a PowerPoint page"}
          onClick={() => choose("presentation")}
        />
      </div>
      {/* A fixed slot, so the spinner appearing does not nudge the buttons. */}
      <span className="flex w-3.5 justify-center" aria-hidden>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />}
      </span>
    </div>
  )
}
