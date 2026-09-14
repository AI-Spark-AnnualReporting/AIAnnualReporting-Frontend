"use client"

import { CSSProperties } from "react"
import type { ThreadReport, ReportGeneration } from "@/lib/api/communications"
import { currentPageUrl, generationHref, hasSomethingToReview, opensModulePage } from "@/lib/reportRoutes"
import { useAuth } from "@/contexts/AuthContext"
import { statusPill, isInReview, isClosed } from "@/lib/report-status"

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
  disabled = false,
}: {
  report: ThreadReport
  subtitle?: string
  // When set the whole card becomes a button (opens the report in review).
  onClick?: () => void
  // A summary and nothing else. The share modal sets it: a link there walks the
  // user out of the form they were filling in.
  disabled?: boolean
}) {
  const { user } = useAuth()
  const pill = statusPill(report.status, report.status_label)
  // An annual report with nothing written yet leads nowhere: its cycle is still
  // empty, and there is no review to open either — the card sits inert and says
  // so, rather than a bare "Linked" that reads as a broken link. Only the annual
  // lane reports a section count, so this is only ever false there.
  const notReady = !hasSomethingToReview(report.generation, report.status)
  const inert = disabled || notReady
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null
  // An unapproved report has nothing settled to read in the review screen, so
  // the card goes to the report's own page — that holds on a review thread too,
  // where the footer's "Open review" is the separate, deliberate action.
  const reportHref =
    !inert && report.generation && opensModulePage(report.generation)
      ? generationHref(report.generation, { role: user?.role, token, backTo: currentPageUrl() })
      : null
  const interactive = !!onClick && !reportHref && !inert

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
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#1A1D2E" }}>{reportHeadline(report)}</span>
          {/* "In review" is what the thread itself already says - every other
              status (draft, approved, locked, published) is news, so show it. */}
          {!isInReview(report.status) && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "2px 9px",
                borderRadius: 20,
                background: pill.bg,
                color: pill.color,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: pill.color }} />
              {pill.text}
            </span>
          )}
        </span>
        <span style={{ display: "block", fontSize: 12, color: "#8890AE", marginTop: 2 }}>
          {notReady && !disabled
            ? "Linked · this report isn't approved yet"
            : inert || (!reportHref && !onClick)
            ? "Linked"
            : !reportHref
              ? subtitle
              : report.generation?.target.kind === "esg_page"
                ? "Linked · click to open the ESG data"
                : "Linked · click to open the report"}
        </span>
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
    background: "transparent",
    border: "none",
    fontFamily: "inherit",
    cursor: interactive ? "pointer" : "default",
    transition: ".15s",
    textAlign: "left",
  }

  return (
    <div style={{ background: "#F6F7FC", borderRadius: 12, overflow: "hidden" }}>
      {reportHref ? (
        <a href={reportHref} style={{ ...style, textDecoration: "none" }}>
          {inner}
        </a>
      ) : interactive ? (
        <button type="button" onClick={onClick} style={style}>
          {inner}
        </button>
      ) : (
        <div style={style}>{inner}</div>
      )}
      {/* Sits OUTSIDE the card button — a link nested in a button is invalid,
          and its click means something different (go to the report, not open
          the review). */}
      <GenerationRow generation={report.generation} status={report.status} />
    </div>
  )
}

/* Where the report behind this card stands.

   `status` answers "where is it in the review dance"; this answers "is there
   anything written" — see ReportGeneration. No buttons: the card itself is the
   link (or the button beside it is), and a second control saying the same
   thing twice is just noise. */
function GenerationRow({
  generation,
  status,
}: {
  generation?: ReportGeneration
  status?: string
}) {
  // An older payload (or a state we don't know yet) says nothing rather than
  // breaking the card.
  if (!generation) return null

  // Only the annual lane counts its sections, so it is the only one that can
  // say how far along a report is. The module lanes report nothing but their
  // approval status, which the pill above already shows — a line here claiming
  // "nothing to preview" was guessing, and guessing wrong on a report that was
  // written and out for review.
  if (generation.done == null) return null
  // A signed-off report is finished whatever the cycle still counts — showing
  // progress under an APPROVED pill only reads as a contradiction.
  if (isClosed(status)) return null

  const percent = generation.percent ?? 0
  return (
    <div style={{ padding: "9px 15px", borderTop: "1px solid #E6E8F4" }}>
      <span
        style={{
          display: "block",
          height: 6,
          borderRadius: 999,
          background: "#E2E5F3",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            display: "block",
            width: `${percent}%`,
            height: "100%",
            borderRadius: 999,
            background: "#4040C8",
          }}
        />
      </span>
      <span style={{ display: "block", fontSize: 11.5, color: "#8890AE", marginTop: 5 }}>
        {percent}% written
      </span>
    </div>
  )
}
