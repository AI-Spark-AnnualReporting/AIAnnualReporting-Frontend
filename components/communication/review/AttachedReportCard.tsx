"use client"

import { CSSProperties } from "react"
import type { ThreadReport } from "@/lib/api/communications"

/**
 * The report a review is about — linked, never copied.
 *
 * Used by the share modal ("Linked · read-only snapshot") and the review thread
 * ("Linked · click to open in review", where the whole card is a button).
 */

const ICON_DOC = (
  <svg width="19" height="19" viewBox="0 0 20 20" fill="none">
    <path
      d="M5 2.6h6.2L15.4 7v10.4a.9.9 0 0 1-.9.9H5a.9.9 0 0 1-.9-.9V3.5a.9.9 0 0 1 .9-.9z"
      stroke="#fff"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path d="M11 2.8V7.2h4.2M7 11h6M7 14h4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const ICON_LINK = (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <path d="M5.8 8.2a2.2 2.2 0 0 0 3.3.24l1.9-1.9a2.2 2.2 0 0 0-3.1-3.1l-1.1 1.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M8.2 5.8a2.2 2.2 0 0 0-3.3-.24l-1.9 1.9a2.2 2.2 0 0 0 3.1 3.1l1.1-1.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)

// "Q3 FY 2026 · Earnings Report", falling back to the backend title.
function reportHeadline(report: ThreadReport): string {
  return report.period && report.type_label ? `${report.period} · ${report.type_label}` : report.title
}

export function AttachedReportCard({
  report,
  subtitle = "Linked · read-only snapshot",
  onClick,
}: {
  report: ThreadReport
  subtitle?: string
  // When set the whole card becomes a button (opens the report in review).
  onClick?: () => void
}) {
  const interactive = !!onClick

  const inner = (
    <>
      <span
        style={{
          width: 40,
          height: 40,
          borderRadius: 11,
          flexShrink: 0,
          background: "linear-gradient(150deg,#5B5BF0,#4040C8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {ICON_DOC}
      </span>
      <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: "#1A1D2E" }}>
          {reportHeadline(report)}
        </span>
        <span style={{ display: "block", fontSize: 12, color: "#8890AE", marginTop: 2 }}>{subtitle}</span>
      </span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
          padding: "7px 13px",
          borderRadius: 9,
          background: "#EDEAFB",
          color: "#5B34D6",
          fontSize: 12.5,
          fontWeight: 700,
        }}
      >
        {ICON_LINK}
        Linked
      </span>
    </>
  )

  const style: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 13,
    width: "100%",
    padding: "13px 15px",
    borderRadius: 12,
    background: "#F6F7FC",
    border: "none",
    fontFamily: "inherit",
    cursor: interactive ? "pointer" : "default",
    transition: ".15s",
  }

  if (!interactive) return <div style={style}>{inner}</div>

  return (
    <button type="button" onClick={onClick} style={style}>
      {inner}
    </button>
  )
}
