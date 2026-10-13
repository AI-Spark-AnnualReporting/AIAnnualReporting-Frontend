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

import { Check, Star, TriangleAlert } from "lucide-react"

import type { DesignOption } from "@/lib/api/createDesign"
import { losesContent, lossText, placedText } from "@/lib/createDesignLoss"
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
}

/**
 * The card's caption: what it loses, else the recommendation's reason, else
 * what it places, else its standing note.
 */
function cardCaption(option: DesignOption): string {
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
}: {
  options: DesignOption[]
  previewKey: string | null
  chosenKey: string | null
  accent?: string
  onPreview: (key: string) => void
  disabled?: boolean
}) {
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
              <TemplateMini templateKey={option.key} accent={accent} />
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
              {cardCaption(option)}
            </div>
          </button>
        )
      })}
    </div>
  )
}
