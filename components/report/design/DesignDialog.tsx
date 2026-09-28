"use client"

import { useEffect, useMemo, useState } from "react"
import type { CSSProperties } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { toast } from "sonner"

import { annualDesignApi } from "@/lib/api/annual-design"
import {
  DEFAULT_LAYOUT_KEY, LAYOUT_TYPOGRAPHY,
  type AnnualDesign, type BrandColors, type ColorPalette,
  type CoverTemplate, type DesignSelection, type Typography,
} from "@/types/report-design"
import { MiniCover } from "./MiniCover"
import { TypographyControls, hasCustomTypography } from "./TypographyControls"

/**
 * How this report should look: cover layout, brand colours, type.
 *
 * The same three settings every report kind in the platform has, saved to the
 * same place, so an annual report designed here comes out of the shared export
 * engine looking like one — rather than like a different product that happens to
 * share a login.
 *
 * It is also, deliberately, a transcription of the modal the other three report
 * kinds use: Centrion_Frontend/src/components/quarterly/CoverTemplatePicker.tsx,
 * which quarterly, earnings and board all mount with identical props. Same
 * geometry, same type scale, same indigo accents, same .btn/.bp/.bs footer.
 * Where the two Tailwind majors disagree about what a class means, the pixel
 * value is written out — see the radius constants below.
 *
 * Everything previews live. Nothing is saved until Apply, so a user can try the
 * three layouts without committing to any of them.
 */

/** The fourth catalogue entry, `branded`, has never been offered in any picker. */
const HIDDEN_TEMPLATES = new Set(["branded"])

// The reference writes rounded-2xl / rounded-lg / rounded-md / rounded, which
// are 16 / 10 / 8 / 4 px there. Under Tailwind v4 here the same four classes
// are 16 / 8 / 6 / 8 — and note the last pair is inverted, so copying the class
// names would leave the tiles and the thumbnail clip visibly wrong.
//
// The slate / indigo / amber / red literals throughout this file are Tailwind
// v3.4's palette, which is what the reference paints. v4 re-derived the scales
// in OKLCH and several land somewhere else in sRGB — measured side by side:
// indigo-500 #6366F1 -> #615FFF, indigo-700 #4338CA -> #432DD7,
// indigo-800 #3730A3 -> #372AAC, slate-500 #64748B -> #62748E,
// slate-700 #334155 -> #314158. Close enough to miss by eye, far enough that a
// pixel diff of the two modals lit up every label. Written as hex so they
// cannot drift again.
const PANEL = "rounded-[16px]"
const TILE = "rounded-[10px]"
const FIELD = "rounded-[8px]"
const THUMB = "rounded-[4px]"

/**
 * The reference's hex parser: returns null for anything unparseable, so junk
 * typed into the field is simply not written anywhere. Lowercase output, which
 * is what the other modal stores.
 */
function normalizeHex(v: string): string | null {
  let s = v.trim()
  if (!s.startsWith("#")) s = `#${s}`
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = "#" + s.slice(1).split("").map((c) => c + c).join("")
  }
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null
}

/**
 * Relative luminance per WCAG.
 *
 * This used to carry the reference modal's blue coefficient of 0.4152, kept on
 * purpose so the two pickers warned on the same colours. It is corrected here
 * because five roles now go through these numbers rather than one warning: the
 * three weights have to sum to 1 to be a luminance at all, and at 1.343 every
 * blue-ish ink read far lighter than it is. Centrion's types/brand.ts:218-231
 * is the corrected copy this follows; the two quarterly files still carrying
 * the wrong number are another team's screens and are left alone.
 */
function luminance(hex: string): number {
  const h = normalizeHex(hex) ?? "#000000"
  const ch = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

const isLight = (hex?: string) => (hex ? luminance(hex) > 0.7 : false)

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/**
 * Ink to put ON a filled swatch — whichever of white / near-black actually
 * reads, measured both ways rather than decided by a lightness threshold. A
 * mid gold sits under `isLight`, so a threshold hands it white at about 2.4:1
 * where measuring picks the dark ink at about 6.9:1.
 */
function onColor(hex: string): string {
  const dark = "#1A1D2E"
  return contrastRatio(hex, dark) >= contrastRatio(hex, "#FFFFFF") ? dark : "#FFFFFF"
}

/**
 * The five inks, in the order they are shown — fields and legend both walk
 * this, so a role cannot appear in one and not the other, or in a different
 * order in each. The notes are the same sentences the other app shows for the
 * same roles.
 *
 * Only `primary` and `secondary` have ever been stored for an older cycle, so
 * every one of these is optional on BrandColors and an absent key stays absent:
 * nothing here invents a colour for a role the report has not set.
 */
type BrandRole = "primary" | "secondary" | "accent" | "text" | "light"

const BRAND_ROLES: readonly { key: BrandRole; label: string; note: string }[] = [
  {
    key: "primary",
    label: "Primary",
    note: "Used for main headings, section titles, cover page, and table headers.",
  },
  {
    key: "secondary",
    label: "Secondary",
    note: "Used for highlights, KPI numbers, dividers, and accent borders.",
  },
  {
    key: "accent",
    label: "Accent",
    note: "A third colour for emphasis marks and small display details.",
  },
  {
    key: "text",
    label: "Text",
    note: "Body ink — a dark, readable colour for running text.",
  },
  {
    key: "light",
    label: "Light",
    note: "A pale tone for rules, dividers and tinted panels.",
  },
]

function templateName(templates: CoverTemplate[], key: string): string {
  return templates.find((t) => t.key === key)?.name || key || "Classic"
}

export interface DesignDialogProps {
  cycleId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Cover fields, so the preview shows this report rather than a placeholder. */
  cover?: {
    companyName?: string
    title?: string
    headline?: string
    periodLabel?: string
    preparedOn?: string
    footnote?: string
    logoUrl?: string | null
    coverImage?: string | null
    isArabic?: boolean
  }
  /**
   * Colours only: the Layout tiles and the type controls are hidden, and Apply
   * sends `brand` alone. The same modal, narrowed — the Create Design screen
   * already owns the cover and the page templates in its own rail, so showing
   * them here as well would give one report two places to choose each.
   */
  colorsOnly?: boolean
  /**
   * Who performs the save. Given, it replaces the internal call — so a screen
   * holding this record in a query cache can write through its own mutation and
   * invalidate what the change touched, rather than having the modal write
   * behind its back. Must reject on failure; the error strip reads its message.
   */
  onApply?: (selection: DesignSelection) => Promise<void>
  onSaved?: () => void
}

export function DesignDialog({
  cycleId, open, onOpenChange, cover, colorsOnly, onApply, onSaved,
}: DesignDialogProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [templates, setTemplates] = useState<CoverTemplate[]>([])
  const [palettes, setPalettes] = useState<ColorPalette[]>([])
  const [design, setDesign] = useState<AnnualDesign | null>(null)

  const [layoutKey, setLayoutKey] = useState<string>(DEFAULT_LAYOUT_KEY)
  const [brand, setBrand] = useState<BrandColors>({})
  const [typography, setTypography] = useState<Typography>(
    LAYOUT_TYPOGRAPHY[DEFAULT_LAYOUT_KEY])
  // Whether the hex panel is showing. Its own state rather than
  // `palette_key === "custom"`, so opening the panel to look at the numbers
  // does not itself mark the palette as custom.
  const [customOpen, setCustomOpen] = useState(false)
  // Which ink the pointer/keyboard is on in the legend. The proof sheet dims
  // every other one, so "what does Light even do?" is answered by looking.
  // Refused for an unset role: lighting up a fallback would teach the wrong
  // colour.
  const [focusRole, setFocusRole] = useState<BrandRole | null>(null)
  const focusIfSet = (r: BrandRole | null) =>
    setFocusRole(r && normalizeHex(brand[r] ?? "") ? r : null)
  // Raised when someone picks a different layout while their type is
  // customised: the layout changes immediately, the type waits for an answer.
  const [swapPrompt, setSwapPrompt] = useState<
    { to: string; toDefaults: Typography } | null>(null)

  const visible = useMemo(
    () => templates.filter((t) => !HIDDEN_TEMPLATES.has(t.key)),
    [templates])

  const recommended = useMemo(
    // The company default outranks the layout blueprint, so someone matching
    // their own company's look is not flagged as having customised anything.
    () => design?.company_default?.typography
       ?? LAYOUT_TYPOGRAPHY[layoutKey]
       ?? LAYOUT_TYPOGRAPHY[DEFAULT_LAYOUT_KEY],
    [design, layoutKey])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setSwapPrompt(null)

    Promise.all([
      annualDesignApi.get(cycleId),
      annualDesignApi.catalogue(),
    ])
      .then(([current, { cover_templates: tpls, color_palettes: pals }]) => {
        if (cancelled) return
        setDesign(current)
        setTemplates(tpls)
        setPalettes(pals)

        // Seed from the report's own choice, then the company default, then the
        // catalogue — the same ladder the backend resolves at render time.
        const key = current.cover_template_key
          ?? current.company_default?.cover_template_key
          ?? tpls.find((t) => t.is_default)?.key
          ?? DEFAULT_LAYOUT_KEY
        setLayoutKey(key)
        // `??` only falls back on null/undefined, and the backend sends `{}`
        // for a report that has not chosen colours — which is truthy, so the
        // company default was never reached and the controls seeded empty. The
        // preview then drew its own fallback purple while the exported file
        // used the company's real colours, so the modal and the document
        // disagreed and NEITHER was what the user had picked.
        const hasOwnBrand = Object.keys(current.brand ?? {}).length > 0
        const seeded = hasOwnBrand ? current.brand : (current.company_default?.brand ?? {})
        setBrand(seeded)
        setCustomOpen(seeded.palette_key === "custom")
        setTypography(current.typography
          ?? current.company_default?.typography
          ?? LAYOUT_TYPOGRAPHY[key]
          ?? LAYOUT_TYPOGRAPHY[DEFAULT_LAYOUT_KEY])
      })
      .catch((e: { message?: string }) => {
        if (!cancelled) setError(e?.message || "Couldn't load the design options.")
      })
      .finally(() => !cancelled && setLoading(false))

    return () => { cancelled = true }
  }, [open, cycleId])

  const applyPalette = (p: ColorPalette) => {
    setCustomOpen(false)
    // Built role by role from the shared table, and a role the preset does not
    // carry is LEFT OUT rather than written as undefined — an older catalogue
    // response has only the two colours, and a preset must not plant an empty
    // `accent` key that then looks like a deliberate choice.
    const next: BrandColors = { palette_key: p.key }
    for (const role of BRAND_ROLES) {
      const hex = p[role.key]
      if (hex) next[role.key] = hex
    }
    setBrand(next)
  }

  /** Sets one role, or clears it when the field is emptied. */
  const setRole = (role: BrandRole, hex?: string) =>
    setBrand((b) => {
      const next: BrandColors = { ...b, palette_key: "custom" }
      if (hex) next[role] = hex
      else delete next[role]
      return next
    })

  const pickLayout = (nextKey: string) => {
    if (nextKey === layoutKey) return
    const nextDefaults = LAYOUT_TYPOGRAPHY[nextKey] ?? LAYOUT_TYPOGRAPHY[DEFAULT_LAYOUT_KEY]
    // Silent switch while the type still matches what this layout recommends;
    // otherwise ask, because silently overwriting a deliberate choice is worse
    // than a mismatch.
    if (hasCustomTypography(typography, recommended)) {
      setSwapPrompt({ to: templateName(visible, nextKey), toDefaults: nextDefaults })
      setLayoutKey(nextKey)
    } else {
      setLayoutKey(nextKey)
      setTypography(nextDefaults)
    }
  }

  const apply = async () => {
    setSaving(true)
    setError(null)
    try {
      // Omitted keys are left alone server-side, so the colours-only save
      // cannot clobber the cover or contents choices this report already has.
      const selection: DesignSelection = colorsOnly
        ? { brand }
        : { cover_template_key: layoutKey, brand, typography }
      if (onApply) await onApply(selection)
      else await annualDesignApi.save(cycleId, selection)
      toast.success(colorsOnly ? "Colours saved" : "Design saved", {
        description: colorsOnly
          ? "The pages will redraw in them."
          : "Your next export will use it.",
      })
      onSaved?.()
      onOpenChange(false)
    } catch (e) {
      setError((e as { message?: string })?.message || "Couldn't save the design.")
    } finally {
      setSaving(false)
    }
  }

  const locked = design?.locked
  // No layout to choose in colours-only mode, so an empty template catalogue is
  // no longer a reason to refuse the save.
  const applyDisabled =
    saving || loading || !!locked || (!colorsOnly && visible.length === 0)
  // The ink the layout thumbnails are drawn in. Named for what it is used for,
  // not for the `accent` role — they are different things and the role now
  // exists, so sharing the word would read as a bug.
  const thumbAccent = brand.primary || "#3C0866"
  const layoutName = templateName(visible, layoutKey)

  const proofSheet = (
    <InkProofSheet brand={brand} focusRole={focusRole} companyName={cover?.companyName} />
  )

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(20,22,40,0.45)] backdrop-blur-[2px]" />
        {/* data-report-design opts this subtree out of the unlayered
            `* { border-color }` reset in globals.css, which otherwise beats
            every border-<colour> utility below. */}
        <DialogPrimitive.Content
          data-report-design
          // The reference is a plain div with nothing focused on open, so Radix
          // grabbing the close button would put a focus ring on the first frame
          // that the other modal never shows.
          onOpenAutoFocus={(e) => e.preventDefault()}
          // focus:outline-none because Radix gives Content tabIndex -1 and the
          // browser then rings the whole panel; the reference is an ordinary
          // div and never shows one.
          className={`fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100%-40px)] max-w-[1080px]
                      -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden ${PANEL}
                      bg-white shadow-2xl focus:outline-none`}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-[#F1F5F9] px-6 py-4">
            <div>
              <DialogPrimitive.Title className="text-[15px] font-extrabold text-[#0F172A]">
                {colorsOnly ? "Colours" : "Report design"}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-0.5 text-[12px] text-[#64748B]">
                {colorsOnly
                  ? "Five brand inks, or a preset. Changes preview live."
                  : "Layout, colours and type. Changes preview live."}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              title="Close"
              className={`flex h-8 w-8 cursor-pointer items-center justify-center ${TILE}
                          border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC]`}
            >
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </DialogPrimitive.Close>
          </div>

          {/* Body — 2 panes on desktop, stacks under 1024px */}
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(280px,40%)]">
            {/* Left pane */}
            <div className="flex flex-col gap-6 overflow-y-auto px-6 py-5">
              {/* Layout — hidden when this modal is opened just for colours. */}
              <section aria-label="Layout" hidden={colorsOnly}>
                <SectionHeader>Layout</SectionHeader>
                {loading ? (
                  <div className="py-2 text-[12px] text-[#94A3B8]">Loading…</div>
                ) : visible.length === 0 ? (
                  <div className="py-2 text-[12px] text-[#94A3B8]">No cover designs available.</div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {visible.map((t) => {
                      const active = t.key === layoutKey
                      return (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => pickLayout(t.key)}
                          aria-pressed={active}
                          className={
                            `cursor-pointer ${TILE} border-2 p-2 text-left transition-colors `
                            + (active
                              ? "border-[#6366F1] bg-[#EEF2FF]"
                              : "border-[#E2E8F0] bg-white hover:border-[#CBD5E1]")
                          }
                        >
                          <div className={`relative mb-2 overflow-hidden ${THUMB}`}>
                            {t.preview_image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={t.preview_image_url} alt={t.name}
                                   className="block aspect-[1/1.3] w-full object-cover" />
                            ) : (
                              <MiniCover templateKey={t.key} accent={thumbAccent} />
                            )}
                            {active && (
                              <span
                                aria-hidden
                                className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#6366F1] text-white"
                              >
                                <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                                  <path d="M2.5 6.2L5 8.7l4.5-5" stroke="#fff" strokeWidth="1.7"
                                        strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </span>
                            )}
                          </div>
                          <div className={"text-[12px] font-bold " + (active ? "text-[#3730A3]" : "text-[#0F172A]")}>
                            {t.name}
                          </div>
                          {t.description && (
                            <div className="mt-0.5 text-[10.5px] leading-snug text-[#64748B]">
                              {t.description}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>

              {/* Brand colour */}
              <section aria-label="Brand colour">
                <SectionHeader>Brand colour</SectionHeader>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {palettes.map((p) => {
                    const active = brand.palette_key === p.key && !customOpen
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => applyPalette(p)}
                        aria-pressed={active}
                        className={
                          "inline-flex cursor-pointer items-center gap-2 rounded-full border-2 px-3 py-1.5 text-[12px] font-semibold transition-colors "
                          + (active
                            ? "border-[#6366F1] bg-[#EEF2FF] text-[#3730A3]"
                            : "border-[#E2E8F0] bg-white text-[#334155] hover:border-[#CBD5E1]")
                        }
                      >
                        <span className="inline-flex">
                          <span style={{ width: 14, height: 14, borderRadius: "50% 0 0 50%", background: p.primary }} />
                          <span style={{ width: 14, height: 14, borderRadius: "0 50% 50% 0", background: p.secondary }} />
                        </span>
                        {p.name}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => setCustomOpen(true)}
                    aria-pressed={customOpen}
                    className={
                      "inline-flex cursor-pointer items-center rounded-full border-2 px-3 py-1.5 text-[12px] font-semibold transition-colors "
                      + (customOpen
                        ? "border-[#6366F1] bg-[#EEF2FF] text-[#3730A3]"
                        : "border-[#E2E8F0] bg-white text-[#334155] hover:border-[#CBD5E1]")
                    }
                  >
                    Custom
                  </button>
                </div>
                {/* The legend. Same table as the fields below, so the two can
                    never fall out of step. A role this report has not set shows
                    a dashed empty tile and an em dash — never a plausible hex
                    that would read as a choice someone made. */}
                <div className="mb-2 flex flex-wrap gap-2">
                  {BRAND_ROLES.map((role) => {
                    const hex = normalizeHex(brand[role.key] ?? "")
                    return (
                      <button
                        key={role.key}
                        type="button"
                        onMouseEnter={() => focusIfSet(role.key)}
                        onMouseLeave={() => focusIfSet(null)}
                        onFocus={() => focusIfSet(role.key)}
                        onBlur={() => focusIfSet(null)}
                        onClick={() => focusIfSet(focusRole === role.key ? null : role.key)}
                        aria-pressed={focusRole === role.key}
                        aria-label={hex ? `Show where ${role.label} is used` : `${role.label} is not set`}
                        title={role.note}
                        className={`flex items-center gap-2 text-left ${FIELD} border px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1] `
                          + (hex ? "border-[#E2E8F0] bg-white" : "border-dashed border-[#CBD5E1] bg-[#F8FAFC]")
                          + (focusRole === role.key ? " ring-2 ring-[#6366F1]" : "")}
                      >
                        <span
                          aria-hidden
                          className={`flex h-6 w-6 items-center justify-center ${THUMB} `
                            + (hex ? "border border-[#E2E8F0]" : "border border-dashed border-[#CBD5E1]")}
                          style={{
                            background: hex ?? "transparent",
                            // Measured both ways rather than thresholded, so the
                            // initial sits legibly on a mid gold as well as on a
                            // navy.
                            color: hex ? onColor(hex) : "#94A3B8",
                          }}
                        >
                          <span className="text-[9px] font-extrabold">{role.label[0]}</span>
                        </span>
                        <span>
                          <span className="block text-[10.5px] font-bold text-[#334155]">
                            {role.label}
                          </span>
                          <span
                            className="block text-[10px] text-[#64748B]"
                            style={{ fontFamily: "var(--font-dm-mono), monospace" }}
                          >
                            {hex ?? "—"}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                {customOpen && (
                  <div className={`flex flex-wrap gap-4 ${TILE} border border-[#E2E8F0] bg-[#F8FAFC] p-3`}>
                    {BRAND_ROLES.map((role) => (
                      <HexField
                        key={role.key}
                        label={role.label}
                        note={role.note}
                        value={brand[role.key]}
                        onChange={(v) => setRole(role.key, v)}
                      />
                    ))}
                  </div>
                )}
                {isLight(brand.primary) && (
                  <div className="mt-2 flex items-center gap-2 text-[11.5px] text-[#B45309]">
                    <span aria-hidden>⚠</span>
                    This colour may be hard to read as an accent — it&apos;ll be darkened for text on white.
                  </div>
                )}
                {/* Body ink is the one role that is read rather than looked at,
                    so it is measured against the page it is printed on instead
                    of being judged on lightness. 4.5:1 is WCAG AA for text. */}
                {brand.text && contrastRatio(brand.text, "#FFFFFF") < 4.5 && (
                  <div className="mt-2 flex items-center gap-2 text-[11.5px] text-[#B45309]">
                    <span aria-hidden>⚠</span>
                    Body text in this colour is only{" "}
                    {contrastRatio(brand.text, "#FFFFFF").toFixed(1)}:1 against the
                    page — under 4.5:1, so it will be hard to read at body size.
                  </div>
                )}
              </section>

              {/* Typography */}
              {!colorsOnly && swapPrompt && (
                <div
                  role="alert"
                  className={`flex flex-wrap items-center justify-between gap-2 ${TILE} border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[12px] text-[#78350F]`}
                >
                  <span>Switch to {swapPrompt.to}&apos;s recommended type?</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSwapPrompt(null)}
                      className={`cursor-pointer ${FIELD} border border-[#FCD34D] bg-white px-2 py-1 text-[11.5px] font-semibold text-[#78350F] hover:bg-[#FEF3C7]`}
                    >
                      Keep mine
                    </button>
                    <button
                      type="button"
                      onClick={() => { setTypography(swapPrompt.toDefaults); setSwapPrompt(null) }}
                      className={`cursor-pointer ${FIELD} bg-[#78350F] px-2 py-1 text-[11.5px] font-semibold text-white hover:bg-[#451A03]`}
                    >
                      Switch
                    </button>
                  </div>
                </div>
              )}
              {!colorsOnly && (
                <TypographyControls
                  value={typography}
                  onChange={setTypography}
                  recommended={recommended}
                  layoutName={layoutName}
                />
              )}
            </div>

            {/* Right pane — preview */}
            <div className="hidden overflow-y-auto border-l border-[#F1F5F9] bg-[#F8FAFC]/50 px-4 py-5 lg:block">
              <div className="mx-auto max-w-[380px]">
                {proofSheet}
              </div>
            </div>

            {/* Compact preview at the foot on smaller widths — collapsible */}
            <MobilePreview sheet={proofSheet} />
          </div>

          {error && (
            <div className="border-t border-[#FEE2E2] bg-[#FEF2F2] px-6 py-2 text-[12px] text-[#B91C1C]">
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-[#F1F5F9] px-6 py-3">
            <button type="button" className="btn bs" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="btn bp"
              disabled={applyDisabled}
              onClick={apply}
              style={{ opacity: applyDisabled ? 0.6 : 1 }}
            >
              {locked ? "Report is locked" : saving ? "Applying…" : "Apply"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ── Sub-parts ────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-[#64748B]">
      {children}
    </div>
  )
}

function MobilePreview({ sheet }: { sheet: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t border-[#F1F5F9] bg-[#F8FAFC]/50 px-4 py-3 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-2 cursor-pointer text-[12px] font-semibold text-[#4F46E5] hover:underline"
      >
        {open ? "Hide preview" : "Show preview"}
      </button>
      {open && (
        <div className="mx-auto max-w-[360px]">{sheet}</div>
      )}
    </div>
  )
}

// A proof sheet: the cover and a data page from the report these inks are for.
// Swatches say what a colour IS; this says where it LANDS, which is the only
// question a person picking five of them has.
//
// This replaces the live CoverPreview/PagePreview pair in the colours modal.
// Those render the real templates faithfully, which is exactly the problem
// here: the cover is mostly white space and the body page spends `accent` and
// `light` on a rule and a tint, so a five-ink palette read as two. Every role
// gets real area below, and hovering a legend chip dims the rest.
//
// Ported from Centrion_Frontend's BrandColorPicker so the two screens teach the
// same thing. Inline styles, matching this file's existing literal-hex idiom.
const PAGE_SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', serif"
const UNSET_INK = "#D7DAE4"

function InkProofSheet({
  brand,
  focusRole,
  companyName,
}: {
  brand: BrandColors
  focusRole: BrandRole | null
  companyName?: string
}) {
  const hex = (k: BrandRole, fallback: string) => normalizeHex(brand[k] ?? "") ?? fallback
  const primary = hex("primary", "#3C0866")
  const secondary = hex("secondary", "#5BC9E2")
  // An unset role draws in a flat neutral, never in another role's colour: the
  // legend shows a dashed tile for these and the page has to agree with it.
  const accent = hex("accent", UNSET_INK)
  const text = hex("text", "#1A1D2E")
  const light = hex("light", "#F1F3F8")

  // Dim the rest, halo the match. The halo is OUTSIDE the element: an inset
  // stroke on a 3px rule covers the rule, so the one thing being asked about
  // would render as a dark bar.
  const ink = (role: BrandRole, halo = false): CSSProperties => {
    const transition = "opacity .16s ease, box-shadow .16s ease"
    if (!focusRole) return { opacity: 1, transition }
    if (focusRole !== role) return { opacity: 0.4, transition }
    return {
      opacity: 1,
      transition,
      ...(halo ? { boxShadow: "0 0 0 2px #fff, 0 0 0 3.5px rgba(26,29,46,.5)" } : {}),
    }
  }

  const page: CSSProperties = {
    boxSizing: "border-box",
    background: "#fff",
    borderRadius: 1,
    overflow: "hidden",
    boxShadow: "0 1px 2px rgba(16,24,40,.10), 0 8px 18px -10px rgba(16,24,40,.28)",
  }
  const company = companyName?.trim() || "Your Company"
  const mono = "var(--font-dm-mono), monospace"

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[11.5px] font-bold text-[#334155]">How these look on the page</span>
        <span className="text-[11px] text-[#64748B]">Point at a colour above, or tap it, to see where it lands.</span>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "stretch", flexWrap: "wrap", padding: 14, borderRadius: 12, background: "#EDEFF5" }}>
        {/* Cover */}
        <div style={{ ...page, width: 128, height: 181, flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ background: primary, flex: "0 0 58%", padding: "12px 10px", display: "flex", flexDirection: "column", justifyContent: "space-between", ...ink("primary") }}>
            <div style={{ fontSize: 6.5, letterSpacing: 1.3, textTransform: "uppercase", color: onColor(primary), opacity: 0.75 }}>Annual Report</div>
            <div style={{ fontFamily: PAGE_SERIF, fontSize: 27, lineHeight: 1, color: onColor(primary) }}>2025</div>
          </div>
          <div style={{ background: secondary, padding: "4px 10px", ...ink("secondary") }}>
            <span style={{ fontSize: 6.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: onColor(secondary) }}>Year in review</span>
          </div>
          <div style={{ position: "relative", flex: 1, padding: "8px 10px", display: "flex", alignItems: "flex-end" }}>
            <span aria-hidden style={{ position: "absolute", inset: 0, background: light, ...ink("light") }} />
            <div style={{ position: "relative", fontFamily: PAGE_SERIF, fontSize: 8.5, color: text, ...ink("text") }}>{company}</div>
          </div>
        </div>

        {/* Data page */}
        <div style={{ ...page, flex: "1 1 260px", minWidth: 240, height: 181, padding: "12px 13px", display: "flex", flexDirection: "column" }}>
          <div style={{ fontFamily: PAGE_SERIF, fontSize: 13.5, color: primary, ...ink("primary") }}>Financial highlights</div>

          <div style={{ display: "flex", marginTop: 8, background: primary, color: onColor(primary), fontSize: 7, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", padding: "4px 7px", ...ink("primary") }}>
            <span style={{ flex: 1 }}>Metric</span>
            <span style={{ width: 56, textAlign: "right" }}>2025</span>
            <span style={{ width: 44, textAlign: "right" }}>Change</span>
          </div>
          {[["Revenue", "4.2bn", "+12.4%"], ["Net income", "0.9bn", "+6.1%"]].map((row, i) => (
            <div key={row[0]} style={{ position: "relative", display: "flex", alignItems: "center", padding: "5px 7px" }}>
              {/* The band is a layer, not the row's background: dimming the row
                  would cap the accent chip inside it. */}
              {i % 2 === 0 && (
                <span aria-hidden style={{ position: "absolute", inset: 0, background: light, ...ink("light") }} />
              )}
              <span style={{ position: "relative", flex: 1, fontSize: 8.5, color: text, ...ink("text") }}>{row[0]}</span>
              <span style={{ position: "relative", width: 56, textAlign: "right", fontFamily: mono, fontSize: 9, fontWeight: 600, color: text, ...ink("text") }}>SAR {row[1]}</span>
              <span style={{ position: "relative", width: 44, textAlign: "right" }}>
                <span style={{ display: "inline-block", padding: "1px 4px", borderRadius: 3, background: accent, color: onColor(accent), fontSize: 7.5, fontWeight: 700, ...ink("accent", true) }}>{row[2]}</span>
              </span>
            </div>
          ))}

          {/* The legend promises secondary carries highlights, so it has to
              carry one somewhere with real area. */}
          <div style={{ marginTop: 8, padding: "5px 8px", background: secondary, color: onColor(secondary), display: "flex", alignItems: "baseline", gap: 6, ...ink("secondary") }}>
            <span style={{ fontFamily: mono, fontSize: 10.5, fontWeight: 600 }}>+12.4%</span>
            <span style={{ fontSize: 7.5, letterSpacing: 0.2 }}>revenue growth year on year</span>
          </div>

          <p style={{ margin: "8px 0 0", fontFamily: PAGE_SERIF, fontSize: 8.5, lineHeight: 1.6, color: text, ...ink("text") }}>
            Growth held across every segment, with margin steady against rising input costs.
          </p>

          <div style={{ marginTop: "auto", paddingTop: 6 }}>
            <div style={{ height: 2, background: light, ...ink("light") }} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 6.5, color: text, opacity: 0.55, ...ink("text") }}>
              <span>{company} · Annual Report 2025</span>
              <span>24</span>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-[1.5] text-[#64748B]">
        Body text always prints in your Text colour. The other four tint headings,
        table headers, highlights and rules.
      </p>
    </div>
  )
}

function HexField({ label, note, value, onChange }: {
  label: string
  /** What this ink is used for, from BRAND_ROLES. */
  note?: string
  value?: string
  /** `undefined` when the field is emptied — the role goes back to unset. */
  onChange: (v: string | undefined) => void
}) {
  // The field keeps its own text so a half-typed hex is not rewritten under the
  // cursor, but it has to follow `value` when the colour changes from outside
  // (the swatch, or a preset). Adjusted during render rather than in an effect
  // — the reference uses useEffect, which this repo's lint rejects, and the
  // render-time form is React's own answer for resetting state on a prop change.
  const [text, setText] = useState(value ?? "")
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setText(value ?? "")
  }
  const hex = normalizeHex(value ?? "")
  return (
    <div className="w-[210px] max-w-full">
      <div className="mb-1 text-[11px] font-bold text-[#475569]">{label}</div>
      <div className="flex items-center gap-2">
        {/* The native colour input cannot represent "no colour" — it always
            paints a swatch, and any hex put in it would look like a choice. So
            it is laid transparently over a tile that draws the state itself: a
            dashed outline with a + while the role is unset, the colour once it
            is set. Clicking anywhere on the tile still opens the picker. */}
        <span
          className={`relative flex h-9 w-10 shrink-0 items-center justify-center ${FIELD} border `
            + (hex ? "border-[#E2E8F0]" : "border-dashed border-[#CBD5E1] bg-white")}
          style={hex ? { background: hex } : undefined}
        >
          {!hex && (
            <span aria-hidden className="text-[13px] font-bold leading-none text-[#94A3B8]">
              +
            </span>
          )}
          <input
            type="color"
            // Only ever the seed the picker opens on while the role is unset;
            // nothing is written until the user actually picks.
            value={hex ?? "#3c0866"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={`${label} colour`}
          />
        </span>
        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            // Emptying the field unsets the role. Junk that is not yet a hex is
            // simply not written anywhere, so a half-typed "#1a" neither clears
            // the colour nor sets a wrong one.
            if (e.target.value.trim() === "") onChange(undefined)
            else {
              const next = normalizeHex(e.target.value)
              if (next) onChange(next)
            }
          }}
          placeholder="Not set"
          className={`w-[110px] ${FIELD} border border-[#E2E8F0] bg-white px-2 py-2 text-[13px] text-[#1E293B] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#A5B4FC]`}
          style={{ fontFamily: "var(--font-dm-mono), monospace" }}
        />
      </div>
      {note && (
        <div className="mt-1 text-[10.5px] leading-snug text-[#64748B]">{note}</div>
      )}
    </div>
  )
}
