"use client"

import type { BrandColors, Typography } from "@/types/report-design"
import { coverVariant } from "@/types/report-design"
import { PAGE_H, PAGE_W } from "./PreviewFrame"

/**
 * The cover as the PDF will print it.
 *
 * Drawn at the renderer's own logical size; PreviewFrame does the scaling. See
 * PagePreview for the body page — between them they cover every type control,
 * which the cover alone does not: it sets its own title size per layout and
 * never shows a subheading, a paragraph, a list or a table.
 *
 * It is a picture of the renderer's output, not the renderer. The two are
 * independent implementations and can drift; what keeps them honest is that the
 * numbers, colours and family names all come from the same settings object the
 * backend is sent.
 *
 * One thing it deliberately cannot show: whether the chosen font is actually
 * installed in the rendering container. The preview loads its own web fonts, so
 * it will happily show Merriweather while the PDF falls back to sans-serif.
 */

const MARGIN = 50

export interface CoverPreviewProps {
  templateKey: string | null
  brand: BrandColors
  typography: Typography
  companyName?: string
  title?: string
  headline?: string
  periodLabel?: string
  logoUrl?: string | null
  /** An uploaded cover image beats every template — it becomes the whole page. */
  coverImage?: string | null
}

/** Readable ink on a given background, mirroring the renderer's own rule. */
function onColor(hex?: string): string {
  const h = (hex || "").replace("#", "")
  if (h.length !== 6) return "#FFFFFF"
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const lin = [r, g, b].map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  const luminance = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
  return luminance > 0.5 ? "#1A1A1A" : "#FFFFFF"
}

function family(name: string): string {
  return /\s/.test(name) ? `'${name}', sans-serif` : `${name}, sans-serif`
}

export function CoverPreview({
  templateKey, brand, typography, companyName, title, headline,
  periodLabel, logoUrl, coverImage,
}: CoverPreviewProps) {
  const variant = coverVariant(templateKey)
  const primary = brand.primary || "#3C0866"
  const subtitle = [periodLabel, "Prepared today"].filter(Boolean).join(" · ")

  const page: React.CSSProperties = {
    width: PAGE_W,
    height: PAGE_H,
    background: "#fff",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    fontFamily: family(typography.body.family),
    color: "#1A1A1A",
  }

  const h1: React.CSSProperties = {
    fontFamily: family(typography.heading.family),
    // Cover title sizes are fixed per variant in the renderer — only the family
    // follows the type controls, so the preview must not scale them either.
    fontSize: variant === "bold" ? 32 : variant === "minimal" ? 26 : 28,
    fontWeight: 700,
    lineHeight: 1.2,
    margin: 0,
  }

  const headlineStyle: React.CSSProperties = {
    fontStyle: "italic",
    lineHeight: 1.45,
    opacity: 0.85,
    maxWidth: "26em",
    fontSize: typography.subheading.size + 2,
  }

  const sub: React.CSSProperties = {
    fontSize: typography.subheading.size,
    fontWeight: typography.subheading.weight,
    fontFamily: family(typography.subheading.family),
    opacity: 0.75,
  }

  const logo = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt="" style={{ maxWidth: 200, maxHeight: 64, objectFit: "contain" }} />
  ) : null

  let body: React.ReactNode

  if (coverImage) {
    body = (
      <div style={{ flex: 1, position: "relative" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={coverImage} alt=""
             style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    )
  } else if (variant === "bold") {
    body = (
      <div style={{ flex: 1, background: primary, color: onColor(primary),
                    padding: "40px 50px", display: "flex", flexDirection: "column",
                    justifyContent: "center", gap: 14 }}>
        {logo}
        <h1 style={h1}>{title}</h1>
        {headline && <div style={headlineStyle}>{headline}</div>}
        {subtitle && <div style={sub}>{subtitle}</div>}
      </div>
    )
  } else if (variant === "minimal") {
    body = (
      <div style={{ flex: 1, padding: `110px ${MARGIN}px ${MARGIN}px`,
                    display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ alignSelf: "flex-end" }}>{logo}</div>
        <h1 style={h1}>
          <span style={{ color: primary }}>▌ </span>{title}
        </h1>
        {headline && <div style={{ ...headlineStyle, marginInline: 0 }}>{headline}</div>}
        {subtitle && <div style={sub}>{subtitle}</div>}
      </div>
    )
  } else {
    body = (
      <div style={{ flex: 1, padding: MARGIN, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 16,
                    textAlign: "center" }}>
        {logo}
        <h1 style={h1}>{title}</h1>
        <div style={{ width: 120, height: 3, background: primary }} />
        {headline && <div style={headlineStyle}>{headline}</div>}
        {subtitle && <div style={sub}>{subtitle}</div>}
        {companyName && <div style={{ ...sub, marginTop: 24 }}>{companyName}</div>}
      </div>
    )
  }

  return <div style={page}>{body}</div>
}
