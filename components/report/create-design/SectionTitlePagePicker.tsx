"use client"

import { Loader2 } from "lucide-react"

/**
 * "Title page" for ONE section: the page that opens it. The first option
 * keeps the report's title page (chosen under Cover → "Section title pages");
 * any other opens just this section on its own design. Saved straight away;
 * the preview beside it redraws with the new title page as its first sheet.
 */
export function SectionTitlePagePicker({
  options,
  choice,
  reportDefaultName,
  locked,
  saving,
  onChoose,
}: {
  /** Every title page for the page shape on screen. */
  options: { key: string; name: string }[]
  /** This section's own pick, or null when it opens on the report's. */
  choice: string | null
  /** The name of the report's title page when it was chosen on its own, else null. */
  reportDefaultName: string | null
  locked: boolean
  saving: boolean
  /** A key, or null to open on the report's title page again. */
  onChoose: (key: string | null) => void
}) {
  const sameAsTheRest = reportDefaultName
    ? `Same as the rest (${reportDefaultName})`
    : "Same as the rest (follows the cover)"

  return (
    <div className="mb-4 border-b pb-4">
      <label
        htmlFor="section-title-page"
        className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-900"
      >
        Title page
        {saving && <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />}
      </label>
      <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
        The page that opens this section.
      </p>
      <select
        id="section-title-page"
        value={choice ?? ""}
        disabled={locked || saving}
        title={locked ? "This report has been approved and locked." : undefined}
        onChange={(event) => onChoose(event.target.value || null)}
        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-default disabled:opacity-60"
      >
        <option value="">{sameAsTheRest}</option>
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  )
}
