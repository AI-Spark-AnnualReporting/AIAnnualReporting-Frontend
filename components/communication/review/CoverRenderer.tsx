"use client"

import type { CSSProperties } from "react"

/**
 * The quarterly cover page, ported verbatim from the Centrion frontend's
 * assembled report (src/components/quarterly/CoverRenderer.tsx) so the reviewer
 * sees the same cover the creator approved — including the template they chose.
 *
 * Accents (rules, period, badge) use the brand colour via var(--brand-primary),
 * which the reviewer's document wrapper sets from the report's own brand; the
 * company name and body text stay dark and readable. Shows REAL company +
 * period — never a placeholder.
 */

const DARK = "#1A1A1A"
const MUTED = "#6B7280"
const ACCENT = "var(--brand-primary, #4040C8)"

type CoverVariant = "classic" | "bold" | "minimal"

function variantFor(templateKey: string | null | undefined): CoverVariant {
  const k = (templateKey || "").toLowerCase()
  if (k.includes("bold")) return "bold"
  if (k.includes("minimal") || k.includes("clean")) return "minimal"
  return "classic"
}

export function CoverRenderer({
  companyName,
  period,
  title,
  preparedOn,
  templateKey,
  maxWidth = 720,
}: {
  companyName: string | null
  period: string | null
  title?: string | null
  preparedOn?: string | null
  templateKey: string | null
  maxWidth?: number // page width; the assembled doc widens it to match sections
}) {
  const variant = variantFor(templateKey)
  const company = companyName || "Your Company"
  const heading = title || "Quarterly Report"

  // Shared page shell — an A4-ish cover card.
  const page: CSSProperties = {
    width: "100%",
    maxWidth,
    aspectRatio: "1 / 1.414",
    margin: "0 auto",
    background: "#fff",
    border: "1px solid #E5E7EF",
    borderRadius: 10,
    boxShadow: "0 10px 30px rgba(20,22,40,.08)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  }

  if (variant === "bold") {
    return (
      <div style={page}>
        <div style={{ background: ACCENT, color: "#fff", padding: "56px 48px 44px" }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", opacity: 0.85 }}>
            {period || ""}
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.05, marginTop: 14 }}>{company}</div>
          <div style={{ fontSize: 20, fontWeight: 600, marginTop: 10, opacity: 0.9 }}>{heading}</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ padding: "0 48px 44px", color: MUTED, fontSize: 13 }}>
          {preparedOn ? `Prepared ${preparedOn}` : ""}
        </div>
      </div>
    )
  }

  if (variant === "minimal") {
    return (
      <div style={{ ...page, alignItems: "flex-start", justifyContent: "center", padding: "0 56px" }}>
        <div style={{ width: 44, height: 4, background: ACCENT, borderRadius: 4, marginBottom: 28 }} />
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: ACCENT }}>
          {period || heading}
        </div>
        <div style={{ fontSize: 38, fontWeight: 800, color: DARK, lineHeight: 1.1, marginTop: 14 }}>{company}</div>
        {period && <div style={{ fontSize: 18, fontWeight: 500, color: MUTED, marginTop: 10 }}>{heading}</div>}
        {preparedOn && <div style={{ fontSize: 13, color: MUTED, marginTop: 22 }}>Prepared {preparedOn}</div>}
      </div>
    )
  }

  // classic (default)
  return (
    <div style={{ ...page, padding: "56px 48px" }}>
      <div style={{ height: 6, width: 120, background: ACCENT, borderRadius: 3 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: ACCENT, marginBottom: 12 }}>
          {period || ""}
        </div>
        <div style={{ fontSize: 42, fontWeight: 800, color: DARK, lineHeight: 1.08 }}>{company}</div>
        <div style={{ fontSize: 22, fontWeight: 600, color: MUTED, marginTop: 14 }}>{heading}</div>
      </div>
      <div style={{ borderTop: `2px solid ${ACCENT}`, paddingTop: 16, display: "flex", justifyContent: "space-between", color: MUTED, fontSize: 13 }}>
        <span>{company}</span>
        <span>{preparedOn ? `Prepared ${preparedOn}` : period || ""}</span>
      </div>
    </div>
  )
}
