"use client"

import type { BrandColors, Typography } from "@/types/report-design"
import { coverVariant } from "@/types/report-design"
import { PAGE_H, PAGE_W } from "./PreviewFrame"

/**
 * A body page as the PDF will print it.
 *
 * The cover exists so the design controls can be judged, but a cover barely
 * uses them: it sets its own title size per layout and never shows a
 * subheading, a paragraph, a list or a table. Four of the nine type controls
 * changed nothing visible, so "Body 10pt vs 12pt" was a number with no picture
 * next to it. This is the picture.
 *
 * Every rule below is transcribed from the renderer's own stylesheet
 * (templates/reports/default/base.css) and its page furniture:
 *
 *   h2  heading family/size/weight, brand ink
 *   h3  sub family/size/weight
 *   h4  sub family/weight, one px smaller than h3
 *   p   body family/size/weight, justified, --lh-body
 *   table  body size minus one, header row brand ink over a 3px brand rule
 *   p.units  fixed 9px muted, deliberately NOT following the body size — it is
 *            a label, not body copy
 *
 * The furniture differs by layout, which is most of why this view is worth
 * having: Classic prints a letterhead line and a rule, Minimal prints the logo
 * alone in more whitespace, Bold prints full-bleed brand bars top and bottom.
 *
 * Like the cover, this is a picture of the renderer's output rather than the
 * renderer. What keeps the two honest is that the numbers, colours and family
 * names all come from the same settings object the backend is sent. It cannot
 * show whether a chosen font is actually installed in the rendering container —
 * the preview loads its own web fonts, so it will happily show Merriweather
 * while the file falls back to sans-serif.
 */

const MARGIN = 50

// Mirrors report_export._BODY_PAGE_MARGIN_PT — Bold needs a taller top margin
// so its full-bleed header bar does not crowd the section content.
const BOLD_TOP = 64
const BOLD_BOTTOM = 56
const BOLD_HEADER_H = 34
const BOLD_FOOTER_H = 24

export interface PagePreviewProps {
  templateKey: string | null
  brand: BrandColors
  typography: Typography
  companyName?: string
  periodLabel?: string
  logoUrl?: string | null
  /** The section this page stands for. Defaults to a representative one. */
  sectionTitle?: string
  sectionNumber?: number
}

function family(name: string): string {
  return /\s/.test(name) ? `'${name}', sans-serif` : `${name}, sans-serif`
}

/** Readable ink on a given background, mirroring the renderer's own rule. */
function onColor(hex?: string): string {
  const h = (hex || "").replace("#", "")
  if (h.length !== 6) return "#FFFFFF"
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const lin = [r, g, b].map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2] > 0.5 ? "#1A1A1A" : "#FFFFFF"
}

export function PagePreview({
  templateKey, brand, typography, companyName, periodLabel, logoUrl,
  sectionTitle = "Operating Review", sectionNumber = 4,
}: PagePreviewProps) {
  const variant = coverVariant(templateKey)
  const primary = brand.primary || "#3C0866"
  const onBrand = onColor(primary)

  const h2: React.CSSProperties = {
    fontFamily: family(typography.heading.family),
    fontSize: typography.heading.size,
    fontWeight: typography.heading.weight,
    color: primary,
    margin: "0 0 10px 0",
  }
  const h3: React.CSSProperties = {
    fontFamily: family(typography.subheading.family),
    fontSize: typography.subheading.size,
    fontWeight: typography.subheading.weight,
    margin: "14px 0 6px 0",
  }
  const h4: React.CSSProperties = {
    ...h3,
    fontSize: typography.subheading.size - 1,
    margin: "12px 0 5px 0",
  }
  const p: React.CSSProperties = {
    fontFamily: family(typography.body.family),
    fontSize: typography.body.size,
    fontWeight: typography.body.weight,
    lineHeight: 1.5,
    textAlign: "justify",
    margin: "0 0 8px 0",
  }
  const cell: React.CSSProperties = {
    border: "1px solid #ccc", padding: "4px 6px", textAlign: "left",
  }
  const th: React.CSSProperties = {
    ...cell,
    fontWeight: typography.heading.weight,
    color: primary,
    borderBottom: `3px solid ${primary}`,
  }

  const bold = variant === "bold"
  const minimal = variant === "minimal"

  const logo = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt=""
         style={{ width: 64, height: 14, objectFit: "contain" }} />
  ) : null

  const header = bold ? (
    // Full-bleed brand bar carrying the section nav strip, current item in a pill.
    <div style={{ position: "absolute", inset: `0 0 auto 0`, height: BOLD_HEADER_H,
                  background: primary, display: "flex", alignItems: "center",
                  gap: 6, padding: "0 12px", overflow: "hidden" }}>
      {logoUrl && (
        <span style={{ background: "#fff", borderRadius: 2, padding: "3px 5px",
                       display: "flex", alignItems: "center" }}>{logo}</span>
      )}
      {["Chairman", sectionTitle, "Governance", "Financials"].map((label, i) => (
        <span key={label}
              style={{
                fontSize: 8, whiteSpace: "nowrap", borderRadius: 999,
                padding: "3px 7px",
                background: i === 1 ? (brand.secondary || "#fff") : "transparent",
                color: i === 1
                  ? onColor(brand.secondary || "#FFFFFF")
                  : onBrand,
                opacity: i === 1 ? 1 : 0.75,
              }}>
          {label}
        </span>
      ))}
    </div>
  ) : minimal ? (
    // The logo alone, higher up and with no rule — matching a cover designed
    // around whitespace and one mark.
    <div style={{ position: "absolute", top: 12, left: MARGIN, right: MARGIN,
                  height: 18, display: "flex", alignItems: "center" }}>
      {logo}
    </div>
  ) : (
    <div style={{ position: "absolute", top: 26, left: MARGIN, right: MARGIN }}>
      <div style={{ height: 18, display: "flex", alignItems: "center",
                    justifyContent: "space-between" }}>
        {logo ?? <span style={{ fontSize: 9, color: "#666" }}>{companyName}</span>}
        <span style={{ fontSize: 9, color: "#666" }}>
          Annual Report{periodLabel ? ` - ${periodLabel}` : ""}
        </span>
      </div>
      <div style={{ height: 1, background: primary, marginTop: 2 }} />
    </div>
  )

  const footer = bold ? (
    <div style={{ position: "absolute", inset: "auto 0 0 0", height: BOLD_FOOTER_H,
                  background: primary, color: onBrand, display: "flex",
                  alignItems: "center", justifyContent: "space-between",
                  padding: `0 ${MARGIN}px`, fontSize: 9 }}>
      <span>{companyName}</span>
      <span>Page 7</span>
    </div>
  ) : (
    <div style={{ position: "absolute", left: MARGIN, right: MARGIN, top: 796 }}>
      <div style={{ height: 1, background: "#ccc" }} />
      <div style={{ display: "flex", justifyContent: "space-between",
                    fontSize: 9, color: "#666", paddingTop: 4 }}>
        <span>{companyName}</span>
        <span>Page 7</span>
      </div>
    </div>
  )

  return (
    <div style={{
      width: PAGE_W, height: PAGE_H, background: "#fff", color: "#1A1A1A",
      position: "relative", overflow: "hidden",
    }}>
      {header}
      {footer}
      <div style={{
        position: "absolute",
        top: bold ? BOLD_TOP : MARGIN + 24,
        bottom: bold ? BOLD_BOTTOM : MARGIN + 24,
        left: MARGIN, right: MARGIN, overflow: "hidden",
      }}>
        <h2 style={h2}>{sectionNumber}. {sectionTitle}</h2>
        <p style={p}>
          Revenue grew across all three operating segments, with the strongest
          contribution from downstream refining. Margins held despite input cost
          pressure in the second half, and the group closed the year with net
          debt one turn below the prior period.
        </p>

        <h3 style={h3}>{sectionNumber}.1 Segment performance</h3>
        <p style={p}>
          Upstream volumes were broadly flat year on year. Downstream benefited
          from higher throughput and a favourable product mix, while chemicals
          absorbed a planned maintenance shutdown.
        </p>

        <p className="units" style={{ fontFamily: family(typography.body.family),
                                      fontSize: 9, color: "#666",
                                      textAlign: "left", margin: "0 0 4px" }}>
          SAR million, unless stated
        </p>
        <table style={{
          width: "100%", borderCollapse: "collapse", tableLayout: "fixed",
          fontFamily: family(typography.body.family),
          fontSize: typography.body.size - 1,
          margin: "0 0 10px 0",
        }}>
          <tbody>
            <tr>
              <th style={{ ...th, width: "60%" }}>Segment</th>
              <th style={th}>FY {periodLabel?.replace(/\D/g, "") || "2026"}</th>
              <th style={th}>Change</th>
            </tr>
            {[["Upstream", "184,200", "+2.1%"],
              ["Downstream", "96,410", "+8.7%"],
              ["Chemicals", "41,905", "−3.4%"]].map((row) => (
              <tr key={row[0]}>
                {row.map((v, i) => (
                  <td key={i} style={{ ...cell, width: i === 0 ? "60%" : undefined }}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <h4 style={h4}>{sectionNumber}.2 Outlook</h4>
        <p style={p}>
          Management expects demand to remain firm into the first half, with
          capital expenditure weighted towards the completion of two downstream
          projects already under construction.
        </p>
        {/* listStyle is spelled out because the app's CSS reset removes markers
            from every ul, and the renderer's own stylesheet does not — without
            it the preview shows a bulleted list as unmarked indented lines,
            which is one of the defects this view exists to catch. */}
        <ul style={{ ...p, textAlign: "left", listStyleType: "disc",
                     paddingInlineStart: 20, margin: "0 0 8px 0" }}>
          <li style={{ margin: "0 0 4px 0" }}>Two downstream projects reach completion.</li>
          <li style={{ margin: "0 0 4px 0" }}>Maintenance shutdowns return to the normal cycle.</li>
        </ul>
      </div>
    </div>
  )
}
