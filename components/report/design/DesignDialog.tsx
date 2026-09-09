"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, Loader2, Palette } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { annualDesignApi } from "@/lib/api/annual-design"
import {
  DEFAULT_LAYOUT_KEY, LAYOUT_TYPOGRAPHY,
  type AnnualDesign, type BrandColors, type ColorPalette,
  type CoverTemplate, type Typography,
} from "@/types/report-design"
import { CoverPreview } from "./CoverPreview"
import { TypographyControls } from "./TypographyControls"

/**
 * How this report should look: cover layout, brand colours, type.
 *
 * The same three settings every report kind in the platform has, saved to the
 * same place, so an annual report designed here comes out of the shared export
 * engine looking like one — rather than like a different product that happens to
 * share a login.
 *
 * Everything previews live. Nothing is saved until Apply, so a user can try the
 * three layouts without committing to any of them.
 */

/** The fourth catalogue entry, `branded`, has never been offered in any picker. */
const HIDDEN_TEMPLATES = new Set(["branded"])

function normaliseHex(input: string): string {
  const v = input.trim().replace(/^#?/, "")
  if (/^[0-9a-f]{3}$/i.test(v)) return "#" + v.split("").map((c) => c + c).join("").toUpperCase()
  if (/^[0-9a-f]{6}$/i.test(v)) return "#" + v.toUpperCase()
  return input
}

/** True when a colour is too pale to read as an accent on white. */
function isPale(hex?: string): boolean {
  const h = (hex || "").replace("#", "")
  if (h.length !== 6) return false
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.7
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
    logoUrl?: string | null
    coverImage?: string | null
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

    Promise.all([
      annualDesignApi.get(cycleId),
      annualDesignApi.templates(),
      annualDesignApi.palettes(),
    ])
      .then(([current, tpls, pals]) => {
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
        setBrand(current.brand ?? current.company_default?.brand ?? {})
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

  const pickLayout = (key: string) => {
    setLayoutKey(key)
    // Only follow the new layout's type if the user has not set their own —
    // silently overwriting a deliberate choice is worse than a mismatch.
    const untouched = JSON.stringify(typography) === JSON.stringify(recommended)
    if (untouched && LAYOUT_TYPOGRAPHY[key]) setTypography(LAYOUT_TYPOGRAPHY[key])
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
        description: "Your next download will use it.",
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-2 border-b bg-indigo-50 px-6 py-5 text-left">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl
                           bg-indigo-600 text-white shadow-sm">
            <Palette className="h-5 w-5" />
          </span>
          <DialogTitle className="text-indigo-900">Report design</DialogTitle>
          <DialogDescription>
            The cover, colours and type your report is published with.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid max-h-[70vh] gap-6 overflow-y-auto p-6
                          lg:grid-cols-[minmax(0,1fr)_minmax(260px,38%)]">
            <div className="space-y-6">
              {/* Layout */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide
                               text-muted-foreground">Cover</h3>
                <div className="grid grid-cols-3 gap-3">
                  {visible.map((t) => (
                    <button key={t.key} type="button" onClick={() => pickLayout(t.key)}
                            aria-pressed={layoutKey === t.key}
                            className={cn(
                              "relative rounded-lg border p-3 text-left text-sm transition-colors",
                              layoutKey === t.key
                                ? "border-primary bg-primary/5"
                                : "border-border hover:bg-accent",
                            )}>
                      {layoutKey === t.key && (
                        <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-primary" />
                      )}
                      <div className="font-medium">{t.name}</div>
                      {t.description && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {t.description}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </section>

              {/* Colour */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide
                               text-muted-foreground">Brand colour</h3>
                <div className="flex flex-wrap gap-2">
                  {palettes.map((p) => (
                    <button key={p.key} type="button"
                            onClick={() => setBrand({ primary: p.primary,
                                                      secondary: p.secondary,
                                                      palette_key: p.key })}
                            className={cn(
                              "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
                              brand.palette_key === p.key
                                ? "border-primary bg-primary/5"
                                : "border-border hover:bg-accent",
                            )}>
                      <span className="flex h-4 w-4 overflow-hidden rounded-full">
                        <span className="w-1/2" style={{ background: p.primary }} />
                        <span className="w-1/2" style={{ background: p.secondary }} />
                      </span>
                      {p.name}
                    </button>
                  ))}
                  <button type="button"
                          onClick={() => setBrand({ ...brand, palette_key: "custom" })}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs",
                            brand.palette_key === "custom"
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-accent",
                          )}>
                    Custom
                  </button>
                </div>

                {brand.palette_key === "custom" && (
                  <div className="flex flex-wrap gap-4">
                    {(["primary", "secondary"] as const).map((slot) => (
                      <label key={slot} className="flex items-center gap-2 text-xs">
                        <span className="capitalize text-muted-foreground">{slot}</span>
                        <input type="color" className="h-7 w-9 rounded border p-0.5"
                               value={brand[slot] || "#3C0866"}
                               onChange={(e) => setBrand({ ...brand, [slot]: e.target.value })} />
                        <input type="text" className="h-7 w-24 rounded border px-2 font-mono"
                               value={brand[slot] || ""}
                               onChange={(e) => setBrand({
                                 ...brand, [slot]: normaliseHex(e.target.value) })} />
                      </label>
                    ))}
                  </div>
                )}

                {isPale(brand.primary) && (
                  <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    This colour may be hard to read as an accent.
                  </p>
                )}
              </section>

              <TypographyControls
                value={typography}
                onChange={setTypography}
                recommended={recommended}
                layoutName={visible.find((t) => t.key === layoutKey)?.name || "this layout"}
              />
            </div>

            {/* Live preview */}
            <div className="lg:sticky lg:top-0 lg:self-start">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide
                            text-muted-foreground">Preview</p>
              <CoverPreview
                templateKey={layoutKey}
                brand={brand}
                typography={typography}
                companyName={cover?.companyName}
                title={cover?.title}
                headline={cover?.headline}
                periodLabel={cover?.periodLabel}
                logoUrl={cover?.logoUrl}
                coverImage={cover?.coverImage}
              />
              {cover?.coverImage && (
                <p className="mt-2 text-xs text-muted-foreground">
                  An uploaded cover image is being used, so the layout above
                  applies to the rest of the report rather than the front page.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t px-6 py-4">
          <p className="text-xs text-destructive">{error}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}
                    disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={apply} disabled={saving || loading || locked}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {locked ? "Report is locked" : saving ? "Applying…" : "Apply"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
