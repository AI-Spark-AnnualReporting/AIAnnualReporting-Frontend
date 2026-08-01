"use client"

import { CSSProperties, useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
  communicationsApi,
  type CommunicationMember,
  type ReviewComment,
  type ReviewReportSection,
  type ReviewViewResponse,
} from "@/lib/api/communications"
import {
  BADGE_GRAY,
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  INPUT,
  MODAL,
  OVERLAY,
  RAIL_LABEL,
  Spinner,
  detailMessage,
  initials,
  relativeTime,
  statusOf,
} from "./shared"

/**
 * Reviewer screen — the "Open as reviewer" destination.
 *
 * Any company member may READ this (a creator watching their report get
 * reviewed sees can_act: false); only the write calls are restricted:
 *   can_act     → you are the assigned reviewer (reassign / request changes)
 *   can_approve → additionally requires the report to be in review
 *
 * Approve is rendered DISABLED, not hidden, when can_act && !can_approve.
 *
 * Section bodies: the review payload's `section.id` IS the report's
 * `section_code`, so it pairs 1:1 with reviewReportSections(). The review list
 * is the source of truth — it returns only the ticked sections (e.g. 11 of 19),
 * so iterating it drops the extras for free.
 */

// Report-level comments come back under the JSON key "null".
const REPORT_LEVEL_KEY = "null"

const ICON_SHARE = (
  <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
    <circle cx="13.4" cy="4.2" r="2.1" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="4.6" cy="9" r="2.1" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="13.4" cy="13.8" r="2.1" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6.5 7.9l5-2.6M6.5 10.1l5 2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

const ICON_COMMENT = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M12 8.4a1.4 1.4 0 0 1-1.4 1.4H4.3L1.9 12V3.1a1.4 1.4 0 0 1 1.4-1.4h7.3A1.4 1.4 0 0 1 12 3.1v5.3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
)

// Split on blank lines into justified paragraphs.
function Prose({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const blocks = paragraphs.length ? paragraphs : [text]
  return (
    <>
      {blocks.map((p, i) => (
        <p
          key={i}
          style={{
            margin: i === 0 ? 0 : "14px 0 0",
            fontSize: 14,
            lineHeight: 1.75,
            color: "#2A2E47",
            whiteSpace: "pre-wrap",
            textAlign: "justify",
          }}
        >
          {p}
        </p>
      ))}
    </>
  )
}

// Structured section payloads arrive as a JSON string. Anything that doesn't
// parse is prose.
function tryParseJson(content: string): Record<string, unknown> | undefined {
  const t = content.trim()
  if (!t.startsWith("{") && !t.startsWith("[")) return undefined
  try {
    const parsed = JSON.parse(t)
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null
}

// Cover payload: { template_key, values: { company_name, title, period_label,
// tone_label, aggregate_confidence } }
function CoverBlock({ values }: { values: Record<string, unknown> }) {
  const company = str(values.company_name)
  const title = str(values.title)
  const period = str(values.period_label)
  const tone = str(values.tone_label)
  const confidence =
    typeof values.aggregate_confidence === "number" ? values.aggregate_confidence : null

  return (
    <div
      style={{
        borderRadius: 14,
        padding: "38px 34px",
        background: "linear-gradient(150deg,#2C2C7A,#4040C8)",
        color: "#fff",
      }}
    >
      {company && (
        <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".9px", textTransform: "uppercase", opacity: 0.75 }}>
          {company}
        </div>
      )}
      {title && (
        <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.15, marginTop: 14, letterSpacing: "-.5px" }}>
          {title}
        </div>
      )}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 18,
          marginTop: 26,
          paddingTop: 16,
          borderTop: "1px solid rgba(255,255,255,.25)",
          fontSize: 12,
          opacity: 0.9,
        }}
      >
        {period && <span>Period · {period}</span>}
        {tone && <span>Tone · {tone.replace(/_/g, " ")}</span>}
        {confidence != null && <span>Confidence · {confidence}%</span>}
      </div>
    </div>
  )
}

type MetricRow = {
  label?: unknown
  code?: unknown
  current_display?: unknown
  prior_display?: unknown
  change_pct?: unknown
  confidence?: unknown
  flag?: unknown
}

// Table/KPI payload: { title, rows: [{ label, current_display, prior_display,
// change_pct, confidence, flag }] }
function MetricTable({ rows }: { rows: MetricRow[] }) {
  const cell: CSSProperties = {
    padding: "9px 10px",
    fontSize: 12.5,
    color: "#2A2E47",
    borderBottom: "1px solid #F0F1F8",
    textAlign: "left",
  }
  const head: CSSProperties = {
    ...cell,
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: ".5px",
    textTransform: "uppercase",
    color: "#8890AE",
    borderBottom: "1px solid #E2E4F0",
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={head}>Metric</th>
            <th style={{ ...head, textAlign: "right" }}>Current</th>
            <th style={{ ...head, textAlign: "right" }}>Prior</th>
            <th style={{ ...head, textAlign: "right" }}>Change</th>
            <th style={{ ...head, textAlign: "right" }}>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const label = str(r.label) ?? str(r.code) ?? "—"
            const flag = str(r.flag)
            const confidence = typeof r.confidence === "number" ? `${r.confidence}%` : "—"
            const change =
              typeof r.change_pct === "number" ? `${r.change_pct > 0 ? "+" : ""}${r.change_pct}%` : "—"
            return (
              <tr key={i}>
                <td style={{ ...cell, fontWeight: 700 }}>
                  {label}
                  {flag && flag !== "ok" && (
                    <span
                      style={{
                        marginLeft: 8,
                        padding: "2px 7px",
                        borderRadius: 20,
                        fontSize: 10,
                        fontWeight: 700,
                        background: flag === "needs_input" ? "#FEF3C7" : "#FEE2E2",
                        color: flag === "needs_input" ? "#B45309" : "#B91C1C",
                      }}
                    >
                      {flag.replace(/_/g, " ")}
                    </span>
                  )}
                </td>
                <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {str(r.current_display) ?? "—"}
                </td>
                <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#8890AE" }}>
                  {str(r.prior_display) ?? "—"}
                </td>
                <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{change}</td>
                <td style={{ ...cell, textAlign: "right", color: "#8890AE" }}>{confidence}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SectionBody({ section }: { section: ReviewReportSection }) {
  const content = section.content
  if (!content || !content.trim()) {
    return (
      <div style={{ fontSize: 12.5, color: "#9BA3C4", fontStyle: "italic" }}>
        This section hasn&apos;t been generated yet.
      </div>
    )
  }

  const parsed = tryParseJson(content)

  // Cover — by mode or by section_code, matching how the report itself decides.
  if (parsed && (section.mode === "cover" || /cover/i.test(section.section_code))) {
    const values = parsed.values
    if (values && typeof values === "object") {
      return <CoverBlock values={values as Record<string, unknown>} />
    }
  }

  // Metric tables (table / kpi / trend), detected by payload shape so a mode
  // we haven't seen still renders rather than dumping JSON.
  if (parsed && Array.isArray(parsed.rows)) {
    return <MetricTable rows={parsed.rows as MetricRow[]} />
  }

  // Parsed to JSON but no renderer matched — show it readably rather than as
  // one unwrapped line.
  if (parsed) {
    return (
      <pre
        style={{
          margin: 0,
          fontSize: 11.5,
          lineHeight: 1.6,
          color: "#4A5170",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        {JSON.stringify(parsed, null, 2)}
      </pre>
    )
  }

  return <Prose text={content} />
}

function CommentRow({ comment, showSection }: { comment: ReviewComment; showSection?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 9, padding: "9px 0", borderTop: "1px solid #F4F5FB" }}>
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          flexShrink: 0,
          background: comment.author.is_you ? "linear-gradient(150deg,#5B5BF0,#4040C8)" : "#EEEEFF",
          color: comment.author.is_you ? "#fff" : "#4040C8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 800,
        }}
      >
        {comment.author.initials || initials(comment.author.full_name)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#1A1D2E" }}>
            {comment.author.full_name}
            {comment.author.is_you && " (you)"}
          </span>
          <span style={{ fontSize: 10.5, color: "#9BA3C4" }}>{relativeTime(comment.created_at)}</span>
          {comment.resolved && <span style={BADGE_GRAY}>Resolved</span>}
        </div>
        {showSection && comment.section_title && (
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#7C3AED", marginTop: 2 }}>
            {comment.section_title}
          </div>
        )}
        <div style={{ fontSize: 12, color: "#3A4066", marginTop: 3, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {comment.body}
        </div>
      </div>
    </div>
  )
}

export function ReviewerView({
  threadId,
  onClose,
  onBack,
  onChanged,
}: {
  threadId: string
  onClose: () => void
  // Back chevron — returns to the thread modal. Falls back to onClose.
  onBack?: () => void
  // Fired after approve / request-changes / reassign so the parent re-fetches.
  onChanged?: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ReviewViewResponse | null>(null)

  // Which section's composer is open. `null` = the report-level composer.
  const [composerFor, setComposerFor] = useState<string | null | undefined>(undefined)
  const [commentBody, setCommentBody] = useState("")
  const [postingComment, setPostingComment] = useState(false)

  const [members, setMembers] = useState<CommunicationMember[]>([])
  const [reassignTo, setReassignTo] = useState<string>("")
  const [reassigning, setReassigning] = useState(false)

  // Report body, keyed by section_code (== the review payload's section.id).
  const [bodies, setBodies] = useState<Record<string, ReviewReportSection>>({})

  const [panel, setPanel] = useState<"approve" | "send_back" | null>(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await communicationsApi.reviewView(threadId)
      setData(res)
      setError(null)
    } catch (e) {
      if (statusOf(e) === 401) return
      setError(detailMessage(e, "Could not load the review. Please try again."))
    } finally {
      setLoading(false)
    }
  }, [threadId])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  // The reassign dropdown needs the member list.
  useEffect(() => {
    communicationsApi
      .members()
      .then((r) => setMembers(r.members))
      .catch(() => {})
  }, [])

  // Pull the report body once we know the report id. Company-scoped on the
  // backend, so a non-owner reviewer can read it.
  const reportId = data?.report?.id
  useEffect(() => {
    if (!reportId) return
    let cancelled = false
    communicationsApi
      .reviewReportSections(reportId)
      .then((res) => {
        if (cancelled) return
        const byCode: Record<string, ReviewReportSection> = {}
        for (const s of res.sections) byCode[s.section_code] = s
        setBodies(byCode)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [reportId])

  const bySection = data?.comments_by_section ?? {}
  const reportLevel = data?.comments_by_section?.[REPORT_LEVEL_KEY] ?? []
  const allComments = data?.comments ?? []

  const openComposer = (sectionId: string | null) => {
    setComposerFor(sectionId)
    setCommentBody("")
  }

  const postComment = async (sectionId: string | null, sectionTitle: string | null) => {
    const body = commentBody.trim()
    if (!body || postingComment) return
    setPostingComment(true)
    try {
      await communicationsApi.addReviewComment(threadId, {
        // Omit both for a report-level comment; the backend fills in the title.
        section_id: sectionId ?? undefined,
        section_title: sectionId ? (sectionTitle ?? undefined) : undefined,
        body,
      })
      setCommentBody("")
      setComposerFor(undefined)
      await load() // re-read so counts and grouping stay authoritative
    } catch (e) {
      if (statusOf(e) === 401) return
      toast.error(detailMessage(e, "Could not post the comment."))
    } finally {
      setPostingComment(false)
    }
  }

  const runReassign = async () => {
    if (!reassignTo || reassigning) return
    setReassigning(true)
    setActionError(null)
    try {
      const res = await communicationsApi.reassignReview(threadId, { assigned_to: reassignTo })
      toast.success("Review reassigned", { description: `Now with ${res.full_name}.` })
      setReassignTo("")
      // The caller is no longer the reviewer — re-read rather than guess.
      await load()
      onChanged?.()
    } catch (e) {
      if (statusOf(e) === 401) return
      setActionError(detailMessage(e, "Could not reassign the review."))
    } finally {
      setReassigning(false)
    }
  }

  const runPanelAction = async () => {
    if (busy || !panel) return
    // Send-back's note is required (422 if blank) — gate it here too.
    if (panel === "send_back" && !note.trim()) {
      setActionError("Add a note explaining what needs to change.")
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      if (panel === "approve") {
        const res = await communicationsApi.approveReview(threadId, note.trim() || undefined)
        toast.success("Report approved", { description: res.status_label })
      } else {
        const res = await communicationsApi.sendBackReview(threadId, note.trim())
        toast.success("Sent back to the creator", { description: res.status_label })
      }
      setPanel(null)
      setNote("")
      await load()
      onChanged?.()
    } catch (e) {
      if (statusOf(e) === 401) return
      setActionError(detailMessage(e, "Something went wrong. Please try again."))
    } finally {
      setBusy(false)
    }
  }

  const report = data?.report
  const assignment = data?.assignment ?? null
  const assignedName = assignment ? (assignment.label ?? assignment.full_name) : null
  const canAct = data?.can_act ?? false
  const canApprove = data?.can_approve ?? false
  const sections = data?.sections ?? []
  // Once the report is approved (or otherwise finished) the review is over —
  // reassign / request-changes no longer make sense even though the backend
  // still reports can_act. Gate the reviewer actions on the review being open.
  const FINISHED_STATUSES = ["approved", "locked", "published", "complete", "completed"]
  const reviewClosed = !!report && FINISHED_STATUSES.includes(report.status)

  return (
    <div style={{ ...OVERLAY, alignItems: "stretch", justifyContent: "stretch", padding: 10 }} onClick={onClose}>
      <div
        style={{
          ...MODAL,
          width: "100%",
          maxWidth: "none",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 20px", borderBottom: "1px solid #ECEEF8" }}>
          <button
            type="button"
            onClick={onBack ?? onClose}
            aria-label="Back to thread"
            style={{
              flexShrink: 0,
              width: 32,
              height: 32,
              borderRadius: 9,
              border: "1.5px solid #E5E7EF",
              background: "#fff",
              color: "#5A6080",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M10 3.5L5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              flexShrink: 0,
              background: "#EDEAFB",
              color: "#5B34D6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {ICON_SHARE}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: "#1A1D2E", letterSpacing: "-.2px" }}>Review report</div>
            <div style={{ fontSize: 12, color: "#8890AE", marginTop: 1 }}>
              {!assignedName ? (
                "Unassigned"
              ) : assignment?.is_you ? (
                <>
                  Reviewing as <span style={{ fontWeight: 800, color: "#5A6080" }}>{assignedName}</span>
                </>
              ) : (
                // You're not the assignee — don't imply you are. Name who is.
                <>
                  Viewing · assigned to <span style={{ fontWeight: 800, color: "#5A6080" }}>{assignedName}</span>
                </>
              )}
            </div>
          </div>
          {report && (
            <span
              style={{
                flexShrink: 0,
                padding: "5px 13px",
                borderRadius: 20,
                background: "#FEF3C7",
                color: "#B45309",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {report.status_label}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              border: "none",
              background: "transparent",
              color: "#9BA3C4",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
            }}
          >
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <Spinner />
            <div style={{ fontSize: 12, color: "#9BA3C4", fontWeight: 600 }}>Loading review…</div>
          </div>
        ) : error ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <div style={{ fontSize: 13, color: "#DC2626" }}>{error}</div>
            <button type="button" style={BTN_SECONDARY} onClick={() => void load()}>
              Retry
            </button>
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px" }}>
            {/* Report + sections */}
            <div style={{ overflowY: "auto", padding: "18px 24px 24px", background: "#F4F5FA", minWidth: 0 }}>
              <div
                style={{
                  padding: "13px 16px",
                  borderRadius: 10,
                  background: "#EFEDFC",
                  fontSize: 12.5,
                  color: "#4A5170",
                  lineHeight: 1.6,
                  marginBottom: 16,
                }}
              >
                Read the report below. Click <strong>Add comment</strong> on any section to leave a note or
                requested change. When you&apos;re done, approve it or send it back to the creator.
              </div>

              {sections.length === 0 && (
                <div
                  style={{ ...CARD, padding: "28px 20px", textAlign: "center", fontSize: 13, color: "#8890AE", marginBottom: 12 }}
                >
                  This report has no generated sections yet — leave a comment on the report as a whole below.
                </div>
              )}

              {sections.map((s) => {
                const comments = bySection[s.id] ?? []
                const open = composerFor === s.id
                // section.id is the report's section_code verbatim.
                const body = bodies[s.id]
                return (
                  <div key={s.id} style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 10 }}>
                      <span
                        style={{
                          minWidth: 24,
                          height: 24,
                          padding: "0 7px",
                          borderRadius: 7,
                          flexShrink: 0,
                          background: "#E6E7F5",
                          color: "#5A6080",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11.5,
                          fontWeight: 800,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {s.order}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 15.5, fontWeight: 800, color: "#1A1D2E" }}>
                        {s.title}
                      </span>
                      {comments.length > 0 && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: 18,
                            height: 18,
                            padding: "0 5px",
                            borderRadius: 6,
                            background: "#F1ECFF",
                            color: "#7C3AED",
                            fontSize: 11,
                            fontWeight: 800,
                          }}
                        >
                          {comments.length}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => (open ? setComposerFor(undefined) : openComposer(s.id))}
                        style={{ ...BTN_SECONDARY, gap: 7, fontSize: 12.5, padding: "7px 13px" }}
                      >
                        <span style={{ color: "#7C3AED", display: "inline-flex" }}>{ICON_COMMENT}</span>
                        {open ? "Cancel" : "Add comment"}
                      </button>
                    </div>

                    <div style={{ ...CARD, padding: "18px 22px" }}>
                      {body ? (
                        <SectionBody section={body} />
                      ) : (
                        <div style={{ fontSize: 12.5, color: "#9BA3C4", fontStyle: "italic" }}>
                          Section content isn&apos;t available for this report.
                        </div>
                      )}

                      {comments.map((c) => (
                        <CommentRow key={c.id} comment={c} />
                      ))}

                      {open && (
                        <div style={{ marginTop: 12 }}>
                          <textarea
                            className="chub-inp"
                            value={commentBody}
                            onChange={(e) => setCommentBody(e.target.value)}
                            placeholder={`Comment on ${s.title}…`}
                            style={{ ...INPUT, minHeight: 68, resize: "vertical", lineHeight: 1.5 }}
                          />
                          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                            <button
                              type="button"
                              style={{ ...BTN_PRIMARY, opacity: commentBody.trim() && !postingComment ? 1 : 0.55 }}
                              disabled={!commentBody.trim() || postingComment}
                              onClick={() => void postComment(s.id, s.title)}
                            >
                              {postingComment ? "Posting…" : "Post comment"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Report-level comments (section_id: null) */}
              <div style={{ ...CARD, padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 800, color: "#1A1D2E" }}>
                    On the report as a whole
                  </span>
                  {reportLevel.length > 0 && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 18,
                        height: 18,
                        padding: "0 5px",
                        borderRadius: 6,
                        background: "#F1ECFF",
                        color: "#7C3AED",
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      {reportLevel.length}
                    </span>
                  )}
                  <button
                    type="button"
                    style={BTN_SECONDARY}
                    onClick={() => (composerFor === null ? setComposerFor(undefined) : openComposer(null))}
                  >
                    {composerFor === null ? "Cancel" : "Add comment"}
                  </button>
                </div>

                {reportLevel.map((c) => (
                  <CommentRow key={c.id} comment={c} />
                ))}

                {composerFor === null && (
                  <div style={{ marginTop: 10 }}>
                    <textarea
                      className="chub-inp"
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      placeholder="Comment on the report…"
                      style={{ ...INPUT, minHeight: 68, resize: "vertical", lineHeight: 1.5 }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                      <button
                        type="button"
                        style={{ ...BTN_PRIMARY, opacity: commentBody.trim() && !postingComment ? 1 : 0.55 }}
                        disabled={!commentBody.trim() || postingComment}
                        onClick={() => void postComment(null, null)}
                      >
                        {postingComment ? "Posting…" : "Post comment"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right rail */}
            <div
              style={{
                borderLeft: "1px solid #ECEEF8",
                overflowY: "auto",
                padding: "18px 18px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              {/* Assignment + reassign */}
              <div style={{ ...CARD, padding: "14px 16px" }}>
                <div style={RAIL_LABEL}>Assignment</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: "linear-gradient(150deg,#7C5CFF,#5B34D6)",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11.5,
                      fontWeight: 800,
                    }}
                  >
                    {assignedName ? initials(assignedName) : "—"}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: "#1A1D2E" }}>
                      {assignedName ?? "Unassigned"}
                      {assignment?.is_you && " (you)"}
                    </span>
                    <span style={{ display: "block", fontSize: 11.5, color: "#8890AE" }}>Current reviewer</span>
                  </span>
                </div>

                {canAct && !reviewClosed && (
                  <>
                    <div style={{ ...RAIL_LABEL, marginTop: 16 }}>Reassign to</div>
                    <select
                      className="chub-inp"
                      value={reassignTo}
                      onChange={(e) => setReassignTo(e.target.value)}
                      style={INPUT}
                    >
                      <option value="">Choose a person…</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.full_name} · {m.display_role}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      style={{
                        ...BTN_SECONDARY,
                        width: "100%",
                        marginTop: 8,
                        gap: 7,
                        opacity: reassignTo && !reassigning ? 1 : 0.55,
                      }}
                      disabled={!reassignTo || reassigning}
                      onClick={() => void runReassign()}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 12L12 2M8.4 2H12v3.6M5.6 12H2V8.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {reassigning ? "Reassigning…" : "Reassign review"}
                    </button>
                  </>
                )}
              </div>

              {/* Comments */}
              <div style={{ ...CARD, padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ ...RAIL_LABEL, marginBottom: 0 }}>Comments</span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 18,
                      height: 18,
                      padding: "0 5px",
                      borderRadius: 6,
                      background: "#F1ECFF",
                      color: "#7C3AED",
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    {allComments.length}
                  </span>
                </div>
                {allComments.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#9BA3C4", textAlign: "center", padding: "18px 6px", lineHeight: 1.5 }}>
                    No comments yet. Click &ldquo;Add comment&rdquo; on a section.
                  </div>
                ) : (
                  allComments.map((c) => <CommentRow key={c.id} comment={c} showSection />)
                )}
              </div>

              {/* Actions. Order matters: a finished report is "review complete"
                  for everyone (the backend also flips can_act to false), so check
                  that before the not-the-reviewer messaging. */}
              {reviewClosed ? (
                <div
                  style={{
                    marginTop: "auto",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "13px 15px",
                    borderRadius: 12,
                    background: "#ECFDF3",
                    border: "1px solid #C7EED8",
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                    <circle cx="10" cy="10" r="8.4" fill="#16A34A" />
                    <path d="M6.4 10.2l2.4 2.4 4.8-4.8" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: "#15803D" }}>
                      Review complete
                    </span>
                    <span style={{ display: "block", fontSize: 12, color: "#3F9E66", marginTop: 2, lineHeight: 1.5 }}>
                      This report has been {report?.status_label?.toLowerCase() ?? "approved"}. No further review
                      actions are available.
                    </span>
                  </span>
                </div>
              ) : !canAct ? (
                assignment?.is_you ? (
                  // The payload says this assignment is yours, yet the server withheld the
                  // action gate on an open review — surface that rather than the generic
                  // read-only line.
                  <div style={{ fontSize: 12, color: "#B45309", lineHeight: 1.5, marginTop: "auto" }}>
                    You&apos;re the assigned reviewer, but the review actions aren&apos;t available for this
                    report right now. Try reloading — if it persists, ask an admin to re-share it.
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "#8890AE", lineHeight: 1.5, marginTop: "auto" }}>
                    You&apos;re viewing this review. Only the assigned reviewer can approve, reassign, or request
                    changes.
                  </div>
                )
              ) : (
                <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                  {panel && (
                    <div style={{ ...CARD, padding: "12px 14px" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#1A1D2E", marginBottom: 8 }}>
                        {panel === "approve" ? "Approve report" : "Request changes"}
                      </div>
                      <textarea
                        className="chub-inp"
                        value={note}
                        onChange={(e) => {
                          setNote(e.target.value)
                          if (actionError) setActionError(null)
                        }}
                        placeholder={
                          panel === "approve" ? "Sign-off note (optional)" : "What needs to change? (required)"
                        }
                        style={{ ...INPUT, minHeight: 76, resize: "vertical", lineHeight: 1.5 }}
                      />
                      {actionError && (
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: "#DC2626", marginTop: 7 }}>
                          {actionError}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button
                          type="button"
                          style={{ ...BTN_SECONDARY, flex: 1 }}
                          onClick={() => {
                            setPanel(null)
                            setNote("")
                            setActionError(null)
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          style={{
                            ...BTN_PRIMARY,
                            flex: 1,
                            opacity: busy || (panel === "send_back" && !note.trim()) ? 0.6 : 1,
                          }}
                          disabled={busy || (panel === "send_back" && !note.trim())}
                          onClick={() => void runPanelAction()}
                        >
                          {busy ? "Working…" : panel === "approve" ? "Approve" : "Send back"}
                        </button>
                      </div>
                    </div>
                  )}

                  {!panel && actionError && (
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: "#DC2626" }}>{actionError}</div>
                  )}

                  {/* The triggers hide while a panel is open — the open panel
                      already carries its own Approve / Send back button. */}
                  {!panel && (
                    <>
                      <button
                        type="button"
                        style={{
                          ...BTN_PRIMARY,
                          width: "100%",
                          gap: 8,
                          padding: "12px 16px",
                          opacity: canApprove ? 1 : 0.5,
                          cursor: canApprove ? "pointer" : "not-allowed",
                        }}
                        disabled={!canApprove}
                        onClick={() => {
                          setPanel("approve")
                          setNote("")
                          setActionError(null)
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                          <path d="M3.5 8.4l3 3 6-6.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Approve report
                      </button>
                      {!canApprove && (
                        <div style={{ fontSize: 11.5, color: "#8890AE", lineHeight: 1.45 }}>
                          Available once the report is in review.
                        </div>
                      )}

                      <button
                        type="button"
                        style={{ ...BTN_SECONDARY, width: "100%", gap: 8, padding: "12px 16px" }}
                        onClick={() => {
                          setPanel("send_back")
                          setNote("")
                          setActionError(null)
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M9.5 1.9l2.6 2.6-7 7-3.1.5.5-3.1 7-7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                        </svg>
                        Request changes &amp; reassign
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
