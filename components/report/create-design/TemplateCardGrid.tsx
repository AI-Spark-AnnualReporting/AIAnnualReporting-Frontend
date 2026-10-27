"use client"

/**
 * The five template cards for one page.
 *
 * Every template is always offered — the classifier recommends, it does not
 * decide. Its pick is sorted first and says why; anything that would drop
 * content says what it loses, so a PM choosing an imperfect fit is doing it
 * knowingly.
 *
 * Card chrome is copied from DesignDialog.tsx:333-376 so the two pickers
 * match, including the literal hexes and radii — see the note there about
 * Tailwind v3/v4 drift.
 */

import { Check, Sparkles, Star, TriangleAlert } from "lucide-react"

import type { DesignOption } from "@/lib/api/createDesign"
import { losesContent, lossText, placedText } from "@/lib/createDesignLoss"
import { CUSTOM_TEMPLATE_KEY } from "@/lib/customTemplate"
import { isLandscapeTemplateKey } from "@/lib/orientation"

import { TEMPLATE_NAMES, TemplateMini } from "./TemplateMini"

const TILE = "rounded-[10px]"
const THUMB = "rounded-[4px]"

/**
 * What a card says when it has no counts to report. The landscape cards never
 * have any — the art director never looked at them — so without this they
 * would sit there with an empty caption.
 */
const CARD_NOTES: Record<string, string> = {
  landscape_columns: "Figures in a strip, a picture band, then three columns of text.",
  landscape_rail: "Two columns of text beside a tinted rail: the picture, the key figures, a quote.",
  landscape_hero: "A brand band with one big figure and a row of small ones, then two columns of text beside the picture.",
  landscape_picture: "A full-height picture beside the title, figures and text; the text then runs in two wide columns.",
  landscape_statement: "A letter: a brand panel with the photo and one quote set large, then the salutation, the letter in columns and the signature.",
  landscape_schedule: "Tables first, after the title and a short introduction. Wide tables run the full width.",
  landscape_essay: "Long text in three columns, opened by a column with the title, the quotes and a picture.",
  landscape_tiles: "Each figure in its own tile, eight to a sheet, four on each half, the right half in the brand colour. The text and tables follow.",
  landscape_tables: "Tables in two half-page columns under their titles: group rows in a brand bar, the current year in bold. Wide tables span both.",
  landscape_editorial: "Four columns of text under a large lead paragraph, subheadings after a small square, the first sheet tinted beyond the title column.",
  landscape_portrait: "A tall portrait with the featured quote and speaker on a brand plate at its foot; the letter beside a rail of three to five key figures.",
  landscape_photo_panel: "A big photo bleeding off the right, a solid brand panel over its left edge carrying text; body text, a lead-in and one figure beside it.",
  landscape_borderless_table: "Only the heading and the tables, full width, with no lines between rows. The text, figures and quotes are not printed.",
  landscape_grid_table: "Only the heading and the tables in two half-page columns: a brand header bar, boxed rows, the current year on grey. The text, figures and quotes are not printed.",
  landscape_people: "A lead statement and intro with the first person featured large; the other people in a grid of photos with their names.",
  photo_panel: "A photo across the top with a brand panel over its lower edge carrying text; body text, a lead-in and one figure below.",
  people_grid: "Intro and the first person featured, then a grid of photos with names. Needs a section that names its people.",
  borderless_table: "Only the heading and the tables, with no lines between rows. The text, figures and quotes are not printed.",
  grid_table: "Only the heading and the tables: a brand header bar, every row boxed in light grey, the current year on grey. The text, figures and quotes are not printed.",
  custom: "Designed for this section. Every figure, paragraph, quote and table prints.",
}

/** The two People templates, one per orientation. */
const PEOPLE_KEYS = ["people_grid", "landscape_people"]

/** Shown on a People card when the section lists nobody. */
const PEOPLE_HINT = "Re-extract this section to list its people"

/**
 * The card's caption: what it loses, else the recommendation's reason, else
 * what it places, else its standing note.
 */
function cardCaption(option: DesignOption, noPeople: boolean): string {
  if (noPeople && PEOPLE_KEYS.includes(option.key)) return PEOPLE_HINT
  if (losesContent(option.dropped)) return lossText(option.dropped, option.counts)
  if (option.recommended && option.reason) return option.reason
  // A no-break space, not an empty string, so a card with nothing to say
  // keeps its caption line and lines up with its neighbours.
  return placedText(option.counts) || CARD_NOTES[option.key] || "\u00A0"
}

export function TemplateCardGrid({
  options,
  previewKey,
  chosenKey,
  accent,
  onPreview,
  disabled,
  presentation = false,
  landscape = false,
  customThumb = null,
  onCreateCustom,
  customPanelOpen = false,
  noPeople = false,
}: {
  options: DesignOption[]
  previewKey: string | null
  chosenKey: string | null
  accent?: string
  onPreview: (key: string) => void
  disabled?: boolean
  /** Draw the landscape thumbnails the 16:9 presentation shape. */
  presentation?: boolean
  /** The sheet is sideways — read by the custom card, whose key cannot say so. */
  landscape?: boolean
  /** The custom template's real first sheet, when it has been drawn already. */
  customThumb?: string | null
  /** Open the "create a custom template" panel. No card when absent. */
  onCreateCustom?: () => void
  /** The create panel is the thing on screen, so its card reads as selected. */
  customPanelOpen?: boolean
  /** The section's extraction lists no people, so the People cards say how to get some. */
  noPeople?: boolean
}) {
  const hasCustom = options.some((option) => option.key === CUSTOM_TEMPLATE_KEY)
  // Recommended first; everything else keeps the engine's order, so the grid
  // is identical on every visit.
  const ordered = [...options].sort(
    (a, b) => Number(b.recommended) - Number(a.recommended),
  )

  return (
    <div className="grid grid-cols-2 gap-3">
      {ordered.map((option) => {
        const active = option.key === previewKey
        const chosen = option.key === chosenKey
        const loses = losesContent(option.dropped)
        // A sideways thumbnail takes the full row, or it would be drawn at
        // half the height of its portrait neighbours and read as a sliver.
        const wide = isLandscapeTemplateKey(option.key)
          || (landscape && option.key === CUSTOM_TEMPLATE_KEY)
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onPreview(option.key)}
            aria-pressed={active}
            disabled={disabled}
            className={
              `cursor-pointer ${TILE} border-2 p-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ` +
              (wide ? "col-span-2 " : "") +
              (active
                ? "border-[#6366F1] bg-[#EEF2FF]"
                : "border-[#E2E8F0] bg-white hover:border-[#CBD5E1]")
            }
          >
            <div className={`relative mb-2 overflow-hidden ${THUMB}`}>
              {option.key === CUSTOM_TEMPLATE_KEY && customThumb ? (
                /* The real page, not a schematic: a custom layout has no
                   fixed look to draw bars for. */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={customThumb}
                  alt=""
                  className="block w-full border border-[#E5E7EF] bg-white"
                />
              ) : (
                <TemplateMini
                  templateKey={option.key}
                  accent={accent}
                  presentation={presentation}
                  landscape={landscape}
                />
              )}
              {chosen && (
                <span
                  aria-label="Chosen"
                  className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white"
                >
                  <Check className="h-2.5 w-2.5" />
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <span
                className={
                  "truncate text-[12px] font-bold " +
                  (active ? "text-[#3730A3]" : "text-[#0F172A]")
                }
              >
                {TEMPLATE_NAMES[option.key] ?? option.key}
              </span>
              {option.recommended && (
                <Star className="h-3 w-3 shrink-0 fill-indigo-500 text-indigo-500" />
              )}
              {/* Red, not amber: every template holds every content type
                  now, so this is a defect notice rather than a trade-off. */}
              {loses && <TriangleAlert className="h-3 w-3 shrink-0 text-red-500" />}
            </div>

            <div className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-[#64748B]">
              {cardCaption(option, noPeople)}
            </div>
          </button>
        )
      })}

      {onCreateCustom && (
        <button
          type="button"
          onClick={onCreateCustom}
          aria-pressed={customPanelOpen}
          disabled={disabled}
          className={
            `col-span-2 flex cursor-pointer items-start gap-3 ${TILE} border-2 border-dashed p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ` +
            (customPanelOpen
              ? "border-[#6366F1] bg-[#EEF2FF]"
              : "border-[#C7D2FE] bg-white hover:border-[#818CF8] hover:bg-[#F5F7FF]")
          }
        >
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F46E5]">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[12px] font-bold text-[#3730A3]">
              {hasCustom ? "Make a new custom template" : "Create a custom template"}
            </span>
            <span className="mt-0.5 block text-[10.5px] leading-snug text-[#64748B]">
              {hasCustom
                ? "Replaces the current custom layout once the new one passes its check."
                : "A layout designed for this section's own content and your brand. Describe it, or let the designer choose."}
            </span>
          </span>
        </button>
      )}
    </div>
  )
}
