"use client"

import { useEffect, useMemo, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { toast } from "sonner"

import { annualDesignApi } from "@/lib/api/annual-design"
import {
  DEFAULT_LAYOUT_KEY, LAYOUT_TYPOGRAPHY,
  type AnnualDesign, type BrandColors, type ColorPalette,
  type CoverTemplate, type Typography,
} from "@/types/report-design"
import { CoverPreview } from "./CoverPreview"
import { MiniCover } from "./MiniCover"
import { PagePreview } from "./PagePreview"
import { PreviewFrame } from "./PreviewFrame"
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
 * Relative luminance, transcribed from Centrion's types/brand.ts:166-172 —
 * including its blue coefficient of 0.4152, where WCAG says 0.0722.
 *
 * Copied rather than corrected on purpose: this only decides whether the "may
 * be hard to read" warning appears, and the point of this file is that the two
 * modals warn on exactly the same colours. Fixing it here alone would make them
 * disagree. #FFD700 is the visible case — it warns today and will not now.
 */
function luminance(hex: string): number {
  const h = normalizeHex(hex) ?? "#000000"
  const ch = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.4152 * ch[2]
}

const isLight = (hex?: string) => (hex ? luminance(hex) > 0.7 : false)

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
  onSaved?: () => void
}

export function DesignDialog({
  cycleId, open, onOpenChange, cover, onSaved,
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
    setBrand({ primary: p.primary, secondary: p.secondary, palette_key: p.key })
  }

  const setCustom = (patch: Partial<Pick<BrandColors, "primary" | "secondary">>) =>
    setBrand((b) => ({ ...b, ...patch, palette_key: "custom" }))

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
      await annualDesignApi.save(cycleId, {
        cover_template_key: layoutKey,
        brand,
        typography,
      })
      toast.success("Design saved", {
        description: "Your next export will use it.",
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
  const applyDisabled = saving || loading || !!locked || visible.length === 0
  const accent = brand.primary || "#3C0866"
  const layoutName = templateName(visible, layoutKey)

  const coverNode = (
    <CoverPreview
      templateKey={layoutKey}
      brand={brand}
      typography={typography}
      companyName={cover?.companyName}
      title={cover?.title}
      headline={cover?.headline}
      periodLabel={cover?.periodLabel}
      preparedOn={cover?.preparedOn}
      footnote={cover?.footnote}
      logoUrl={cover?.logoUrl}
      coverImage={cover?.coverImage}
      isArabic={cover?.isArabic}
    />
  )
  const pageNode = (
    <PagePreview
      templateKey={layoutKey}
      brand={brand}
      typography={typography}
      companyName={cover?.companyName}
      periodLabel={cover?.periodLabel}
      logoUrl={cover?.logoUrl}
    />
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
                Report design
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-0.5 text-[12px] text-[#64748B]">
                Layout, colours and type. Changes preview live.
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
              {/* Layout */}
              <section aria-label="Layout">
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
                              <MiniCover templateKey={t.key} accent={accent} />
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
                {customOpen && (
                  <div className={`flex flex-wrap gap-4 ${TILE} border border-[#E2E8F0] bg-[#F8FAFC] p-3`}>
                    <HexField label="Primary" value={brand.primary}
                              onChange={(v) => setCustom({ primary: v })} />
                    <HexField label="Secondary" value={brand.secondary}
                              onChange={(v) => setCustom({ secondary: v })} />
                  </div>
                )}
                {isLight(brand.primary) && (
                  <div className="mt-2 flex items-center gap-2 text-[11.5px] text-[#B45309]">
                    <span aria-hidden>⚠</span>
                    This colour may be hard to read as an accent — it&apos;ll be darkened for text on white.
                  </div>
                )}
              </section>

              {/* Typography */}
              {swapPrompt && (
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
              <TypographyControls
                value={typography}
                onChange={setTypography}
                recommended={recommended}
                layoutName={layoutName}
              />
            </div>

            {/* Right pane — preview */}
            <div className="hidden overflow-y-auto border-l border-[#F1F5F9] bg-[#F8FAFC]/50 px-4 py-5 lg:block">
              <div className="mx-auto max-w-[380px]">
                <PreviewFrame cover={coverNode} page={pageNode} />
              </div>
            </div>

            {/* Compact preview at the foot on smaller widths — collapsible */}
            <MobilePreview cover={coverNode} page={pageNode} />
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

function MobilePreview({ cover, page }: { cover: React.ReactNode; page: React.ReactNode }) {
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
        <div className="mx-auto max-w-[360px]">
          <PreviewFrame cover={cover} page={page} />
        </div>
      )}
    </div>
  )
}

function HexField({ label, value, onChange }: {
  label: string
  value?: string
  onChange: (v: string) => void
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
  return (
    <div className="max-w-[220px]">
      <div className="mb-1 text-[11px] font-bold text-[#475569]">{label}</div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          // The preview falls back to #3C0866 when no colour is set, so the
          // swatch has to claim the colour that is actually being drawn.
          value={normalizeHex(value ?? "") ?? "#3c0866"}
          onChange={(e) => onChange(e.target.value)}
          className={`h-9 w-10 cursor-pointer ${FIELD} border border-[#E2E8F0] bg-white p-0`}
          aria-label={`${label} color`}
        />
        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            const hex = normalizeHex(e.target.value)
            if (hex) onChange(hex)
          }}
          placeholder="#4040C8"
          className={`w-[110px] ${FIELD} border border-[#E2E8F0] bg-white px-2 py-2 text-[13px] text-[#1E293B] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#A5B4FC]`}
          style={{ fontFamily: "var(--font-dm-mono), monospace" }}
        />
      </div>
    </div>
  )
}
