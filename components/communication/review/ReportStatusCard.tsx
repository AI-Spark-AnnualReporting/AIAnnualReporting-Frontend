"use client"

import { isClosed, statusPill } from "@/lib/report-status"
import { CARD, RAIL_LABEL } from "./shared"

/**
 * The "Report status" rail card — a dot, the status, and what it means.
 *
 * Sits above <ReportHubPanel showStatus={false}> so the status reads as one
 * plain line instead of a radio group. Port of Centriyon's shared card, which
 * the board and quarterly reports use for exactly this.
 *
 * Centriyon's version is binary (Draft / Approved) because those rails never
 * surface the review states. This one takes the real `reports.status`: on the
 * annual report the Communication Hub moves it to in_review on share, and
 * "Draft · editing in progress" would be a lie while it sits with a reviewer.
 */

const INK = "#1A1D2E"
const MUTED = "#5A6080"

// Mirrors the backend's HUB_STATUSES wording so the card and the Hub's own
// radio group say the same thing about the same status.
const STATUS_TEXT: Record<string, { label: string; hint: string }> = {
  draft: { label: "Draft", hint: "editing in progress" },
  in_review: { label: "In review", hint: "shared with reviewers" },
  pending_approval: { label: "Ready for approval", hint: "awaiting sign-off" },
  approved: { label: "Approved", hint: "final & locked" },
  locked: { label: "Locked", hint: "final & locked" },
  published: { label: "Published", hint: "final & locked" },
}

// "2026-07-30T09:16:44Z" → "Jul 30, 2026". Null for a missing/unparseable
// timestamp so the caller falls back rather than printing "Invalid Date".
export function formatApprovedDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

export function ReportStatusCard({
  status,
  approvedAt,
}: {
  // A raw reports.status code. An unknown one falls back to Draft.
  status?: string | null
  // When present, a signed-off report reads "· approved <date>" instead of the
  // generic "· final & locked". Never fabricate one — pass null if absent.
  approvedAt?: string | null
}) {
  const key = (status ?? "draft").trim().toLowerCase()
  const text = STATUS_TEXT[key] ?? STATUS_TEXT.draft
  const date = formatApprovedDate(approvedAt)
  const hint = isClosed(key) && date ? `approved ${date}` : text.hint

  return (
    <div style={{ ...CARD, padding: "14px 16px" }}>
      <div style={RAIL_LABEL}>Report status</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            // The shared status→colour map, so the dot agrees with every pill.
            background: statusPill(key).color,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>
          {text.label}
        </span>
        <span style={{ fontSize: 12, color: MUTED, marginLeft: 2 }}>· {hint}</span>
      </div>
    </div>
  )
}
