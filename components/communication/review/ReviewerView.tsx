"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
  communicationsApi,
  type CommunicationMember,
  type ReviewComment,
  type ReviewReportBrand,
  type ReviewReportHeader,
  type ReviewReportSection,
  type ReviewSection,
  type ReviewViewResponse,
} from "@/lib/api/communications"
import { dirOf } from "@/lib/lang"
import { statusPill } from "@/lib/report-status"
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
import { CoverRenderer } from "./CoverRenderer"
import { SectionContent } from "./SectionContent"
import { EarningsSectionContent } from "./EarningsSectionContent"
import { Skeleton } from "@/components/ui/skeletons"

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

// "23 Aug 2026" for the removed-from-thread banner.
function formatRemovedOn(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
}

// Report-level comments come back under the JSON key "null".
const REPORT_LEVEL_KEY = "null"

// Anchors for the in-document sections, so the comments rail can jump to one.
const sectionDomId = (sectionId: string) => `review-sec-${sectionId}`

// Quarterly reports keep their body behind the quarterly assemble endpoint;
// every other type reads through the earnings sections endpoint.
const QUARTERLY = "quarterly"
const EARNINGS = "earnings"
const ANNUAL = "annual"

// Document presentation, matched to the quarterly assembled report so the
// reviewer reads exactly what the creator approved — same page width,
// numbering, and brand accents. BRAND resolves against --brand-primary, set on
// the document wrapper from the report's own brand colours.
const DOC_WIDTH = 820
const MONO = "var(--font-dm-mono), 'DM Mono', 'Courier New', monospace"
const BRAND = "var(--brand-primary, #4040C8)"
const pad2 = (n: number) => String(n).padStart(2, "0")

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

// `onJump` makes the whole row a target that scrolls the document to the
// section this comment is on. Omitted for report-level comments (no section to
// scroll to) and for the rows already rendered inside their own section.
/* Placeholder lines while a section's body is still in flight.

   Ragged widths on purpose: three equal bars read as a table, not as text
   about to arrive. */
function SectionBodySkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }} aria-busy="true" aria-label="Loading section content">
      <Skeleton style={{ height: 11, width: "92%" }} />
      <Skeleton style={{ height: 11, width: "100%" }} />
      <Skeleton style={{ height: 11, width: "78%" }} />
    </div>
  )
}

function CommentRow({
  comment,
  showSection,
  onJump,
}: {
  comment: ReviewComment
  showSection?: boolean
  onJump?: () => void
}) {
  return (
    <div
      style={{ display: "flex", gap: 9, padding: "9px 0", borderTop: "1px solid #F4F5FB", cursor: onJump ? "pointer" : undefined }}
      {...(onJump && {
        role: "button",
        tabIndex: 0,
        title: `Go to ${comment.section_title ?? "this section"}`,
        onClick: onJump,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onJump()
          }
        },
      })}
    >
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
        <div dir={dirOf(comment.body)} style={{ fontSize: 12, color: "#3A4066", marginTop: 3, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
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
  // The bodies arrive in their own request, after the headings. Until it lands
  // every section rendered "hasn't been generated yet", which is a lie about a
  // report that is merely still loading.
  const [bodiesLoading, setBodiesLoading] = useState(false)
  // Quarterly only — cover values, chosen cover template, and brand accents for
  // the document page.
  const [header, setHeader] = useState<ReviewReportHeader | null>(null)
  const [brand, setBrand] = useState<ReviewReportBrand | null>(null)
  const [coverTemplateKey, setCoverTemplateKey] = useState<string | null>(null)

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

  // The quarterly body endpoint is company-scoped in its path. Resolve the id
  // from the Centrion JWT rather than the local user, whose company_id is only
  // populated for PMs/admins — a HOD reviewer would otherwise have none.
  // The name comes back on the same call and is the cover's fallback company —
  // /assemble routinely omits `header` entirely.
  const [centrionCompanyId, setCentrionCompanyId] = useState<string | null>(null)
  const [centrionCompanyName, setCentrionCompanyName] = useState<string | null>(null)
  useEffect(() => {
    communicationsApi
      .getMyCompany()
      .then((c) => {
        setCentrionCompanyId(c.id)
        setCentrionCompanyName(c.name ?? null)
      })
      .catch(() => {})
  }, [])

  // Pull the report body once we know the report id and type. Both endpoints
  // are company-scoped on the backend, so a non-owner reviewer can read them.
  const reportId = data?.report?.id
  const reportType = data?.report?.report_type
  // Types whose written body this screen can actually fetch — see the effect
  // below. Annual is written in the reporting-cycles system and ESG has no
  // sections at all, so for those the headings are all there is to show.
  const hasBodySource =
    reportType === QUARTERLY || reportType === EARNINGS || reportType === ANNUAL

  // The reassign dropdown needs the member list - scoped to this report, since
  // handing the review to someone who cannot open it is refused anyway.
  useEffect(() => {
    if (!reportId) return
    communicationsApi
      .members(reportId)
      .then((r) => setMembers(r.members))
      .catch(() => {})
  }, [reportId])

  useEffect(() => {
    if (!reportId || !reportType) return
    // Wait for the company id rather than firing the earnings path at a
    // quarterly report, which 404s.
    if (reportType === QUARTERLY && !centrionCompanyId) return
    let cancelled = false
    const load =
      reportType === QUARTERLY && centrionCompanyId
        ? communicationsApi.reviewQuarterlySections(centrionCompanyId, reportId)
        : reportType === EARNINGS
          ? communicationsApi.reviewReportSections(reportId)
          : reportType === ANNUAL
            // Written in the reporting-cycles system, so it comes from the
            // Hub's own endpoint rather than a per-report module table.
            ? communicationsApi.reviewAnnualSections(reportId)
            // ESG keeps metrics, not sections. This used to fall through to the
            // earnings endpoint, which answers "Earnings report <id> not found"
            // — an error about the wrong report, on a report that is fine.
            : null
    if (!load) {
      setBodies({})
      setBodiesLoading(false)
      return
    }
    setBodiesLoading(true)
    load
      .then((res) => {
        if (cancelled) return
        const byCode: Record<string, ReviewReportSection> = {}
        for (const s of res.sections) byCode[s.section_code] = s
        setBodies(byCode)
        // Only overwrite when this response actually carries the field. The
        // earnings path returns no header/brand, so assigning unconditionally
        // would race the cover-selection effect below and null out the brand it
        // just fetched — whichever request resolved last would win.
        if (res.header) setHeader(res.header)
        if (res.brand) setBrand(res.brand)
        if (res.cover_template_key) setCoverTemplateKey(res.cover_template_key)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setBodiesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reportId, reportType, centrionCompanyId])

  // Earnings brand accents. Quarterly gets its brand from /assemble above;
  // earnings keeps it behind the cover-template endpoint. No other type has an
  // earnings cover to ask for.
  useEffect(() => {
    if (reportType !== EARNINGS || !reportId) return
    let cancelled = false
    communicationsApi
      .reviewEarningsCoverSelection(reportId)
      .then((res) => {
        if (cancelled) return
        if (res.brand) setBrand(res.brand)
        // Fallback template key for a cover section whose envelope omits it.
        if (res.cover_template_key) setCoverTemplateKey(res.cover_template_key)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [reportId, reportType])

  const bySection = data?.comments_by_section ?? {}
  const reportLevel = data?.comments_by_section?.[REPORT_LEVEL_KEY] ?? []
  const allComments = data?.comments ?? []

  const openComposer = (sectionId: string | null) => {
    setComposerFor(sectionId)
    setCommentBody("")
  }

  // Rail comment → its section in the document. A comment can outlive the
  // section it was left on (the report was regenerated with a different
  // outline), so a missing anchor is a no-op rather than a crash.
  const jumpToSection = (sectionId: string) => {
    document.getElementById(sectionDomId(sectionId))?.scrollIntoView({ behavior: "smooth", block: "start" })
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

  // `kind` is passed explicitly by the send-back button, which fires without a
  // panel: reading `panel` there would read the state before React commits it.
  const runPanelAction = async (kind: "approve" | "send_back" | null = panel) => {
    if (busy || !kind) return
    setBusy(true)
    setActionError(null)
    try {
      if (kind === "approve") {
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
  // The backend refuses a reassign to whoever already holds the review (422
  // "Review is already assigned to that person"), so drop them from the picker
  // rather than offering a choice the server will always reject. Matched on the
  // usr_ id: the option's value is the users.id UUID the API wants, but the
  // assignment carries the string id.
  // Neither the person who already holds the review (422 "already assigned")
  // nor the report's own author (422 "cannot review their own report").
  const reassignable = members.filter(
    (m) => m.user_id !== assignment?.user_id && m.user_id !== data?.owner?.user_id,
  )
  // Send-back returns the report to its author to be changed. When you ARE the
  // author — the review was assigned or reassigned to the report's own owner —
  // there is nobody to send it back to, so the action is dropped rather than
  // offered as "Send back to <your own name>". Reassign stays: handing the
  // review to someone else is still a real thing to do.
  const isOwner = data?.owner?.is_you === true
  const assignedName = assignment ? (assignment.label ?? assignment.full_name) : null
  const canAct = data?.can_act ?? false
  // Removed from the thread → read the record, add nothing to it. can_act
  // already folds in the removal, so the approve/reassign buttons need nothing.
  // No assignment means nobody was asked to review this — the screen is here to
  // be read. The reviewer furniture (the brief, the comment controls, the
  // assignment/comments rail) is all about a review that isn't happening.
  const viewOnly = !data?.assignment
  // The rail is not only the reviewer's controls — it is also where the
  // comments live. A report sent back for changes has no assignment, so
  // gating the whole rail on that hid the feedback from the one person who
  // has to act on it. Keep the column whenever there is something to read.
  const showRail = !viewOnly || allComments.length > 0
  const canComment = !viewOnly && (data?.can_comment ?? true)
  const removedAt = data?.removed_at ?? null
  const canApprove = data?.can_approve ?? false
  // The review payload's section list is earnings-only on the backend — it
  // comes back empty for a quarterly report even when the report is fully
  // assembled, which rendered the whole screen as "no generated sections yet".
  // Fall back to the sections we already fetched for the bodies. Comments key
  // off section_code either way, so posting and grouping are unaffected.
  const isQuarterly = reportType === QUARTERLY
  // Annual joins it: what the reviewer signs off is the assembled report, so it
  // renders as one page rather than a stack of cards. Its cover and contents
  // are drawn at assembly, so the sections that stand for them are dropped
  // here the way the quarterly cover is.
  const isAnnualDoc = reportType === ANNUAL
  const isDocument = isQuarterly || isAnnualDoc
  const allSections: ReviewSection[] = data?.sections?.length
    ? data.sections
    : Object.values(bodies)
        .sort((a, b) => a.display_order - b.display_order)
        .map((s, i) => ({ id: s.section_code, order: i + 1, title: s.title, type: s.mode }))
  const sections: ReviewSection[] = isAnnualDoc
    ? allSections.filter((s) => !/cover/i.test(s.id) && !/toc/i.test(s.id))
    : allSections
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
            <div style={{ fontSize: 15.5, fontWeight: 800, color: "#1A1D2E", letterSpacing: "-.2px" }}>
              {viewOnly ? report?.title ?? "Report" : "Review report"}
            </div>
            <div style={{ fontSize: 12, color: "#8890AE", marginTop: 1 }}>
              {viewOnly ? (
                report?.type_label ?? "Read-only"
              ) : !assignedName ? (
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
          {report && (() => {
              const pill = statusPill(report.status, report.status_label)
              return (
                <span
                  style={{
                    flexShrink: 0,
                    padding: "5px 13px",
                    borderRadius: 20,
                    background: pill.bg,
                    color: pill.color,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {pill.text}
                </span>
              )
          })()}
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
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "grid",
              gridTemplateColumns: showRail ? "minmax(0, 1fr) 340px" : "minmax(0, 1fr)",
            }}
          >
            {/* Report + sections */}
            <div style={{ overflowY: "auto", padding: "18px 24px 24px", background: "#F4F5FA", minWidth: 0 }}>
              {/* Reviewing instructions, so only where a review is happening.
                  The exception is the removal notice: someone reading a thread
                  they were taken out of needs to know why it is read-only. */}
              {(!viewOnly || removedAt) && (
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
                {canComment ? (
                  <>
                    Read the report below. Click <strong>Add comment</strong> on any section to leave a note or
                    requested change. When you&apos;re done, approve it or send it back to the creator.
                  </>
                ) : (
                  <>
                    You were removed from this conversation
                    {removedAt ? ` on ${formatRemovedOn(removedAt)}` : ""}. You can read what was said up to then.
                  </>
                )}
              </div>
              )}

              {sections.length === 0 && (
                <div
                  style={{ ...CARD, padding: "28px 20px", textAlign: "center", fontSize: 13, color: "#8890AE", marginBottom: 12 }}
                >
                  {canComment
                    ? "This report has no generated sections yet — leave a comment on the report as a whole below."
                    : "This report has no generated sections yet."}
                </div>
              )}

              {/* Quarterly cover — page 1. Values come from the assemble
                  header; the section itself is dropped upstream because the
                  report never renders its content either. */}
              {isDocument && sections.length > 0 && (
                <div
                  style={{
                    marginBottom: 20,
                    ["--brand-primary" as string]: brand?.primary ?? "#4040C8",
                    ["--brand-secondary" as string]: brand?.secondary ?? "#4040C8",
                  }}
                >
                  {/* Fed exactly what AssembledReportPage feeds it: header
                      values only, with the company falling back to the JWT (its
                      one fallback). Don't substitute the review payload's period
                      or title — /assemble omits `header`, so that would put
                      values on this cover that the real cover doesn't show. */}
                  {/* Annual has no /assemble header to read — the report's own
                      meta is what its cycle prints on the cover. */}
                  <CoverRenderer
                    companyName={header?.company_name ?? centrionCompanyName}
                    period={header?.period_label ?? (isAnnualDoc ? report?.period ?? null : null)}
                    title={header?.title ?? (isAnnualDoc ? report?.title ?? null : null)}
                    preparedOn={header?.prepared_on ?? null}
                    templateKey={coverTemplateKey}
                    maxWidth={DOC_WIDTH}
                  />
                </div>
              )}

              {/* The document page itself — one sheet, as the assembled report
                  renders it. Only when it has something on it, so the empty
                  state above isn't followed by a blank sheet. */}
              <div
                style={{
                  ["--brand-primary" as string]: brand?.primary ?? "#4040C8",
                  ["--brand-secondary" as string]: brand?.secondary ?? "#4040C8",
                  ...(isDocument && sections.length > 0
                    ? { ...CARD, padding: "32px 40px", maxWidth: DOC_WIDTH, margin: "0 auto" }
                    : {}),
                }}
              >
              {sections.map((s, i) => {
                const comments = bySection[s.id] ?? []
                const open = composerFor === s.id
                // section.id is the report's section_code verbatim.
                const body = bodies[s.id]
                return (
                  // The anchor jumpToSection scrolls to when a comment row in
                  // the rail is clicked. scrollMarginTop keeps the heading off
                  // the top edge of the scroll container.
                  <div
                    key={s.id}
                    id={sectionDomId(s.id)}
                    style={{ marginBottom: 16, scrollMarginTop: 12 }}
                  >
                    {/* dir on the row so the order chip sits right of an Arabic title. */}
                    <div dir={dirOf(s.title)} style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 10 }}>
                      <span
                        style={{
                          flexShrink: 0,
                          fontWeight: isDocument ? 700 : 800,
                          ...(isDocument
                            ? { fontFamily: MONO, fontSize: 12, color: BRAND }
                            : // Earnings preview: faint "01", tabular figures.
                              { fontSize: 11, color: "#9BA3C4", fontVariantNumeric: "tabular-nums" }),
                        }}
                      >
                        {pad2(i + 1)}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontWeight: 800,
                          color: BRAND,
                          ...(isDocument ? { fontSize: 19, lineHeight: 1.25 } : { fontSize: 16 }),
                        }}
                      >
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
                        style={{
                          ...BTN_SECONDARY,
                          gap: 7,
                          fontSize: 12.5,
                          padding: "7px 13px",
                          display: canComment ? undefined : "none",
                        }}
                      >
                        <span style={{ color: "#7C3AED", display: "inline-flex" }}>{ICON_COMMENT}</span>
                        {open ? "Cancel" : "Add comment"}
                      </button>
                    </div>

                    {/* Quarterly sits directly on the document page; every
                        other type keeps its own card. */}
                    <div style={isDocument ? undefined : { ...CARD, padding: "18px 22px" }}>
                      {body ? (
                        // Quarterly reads through the ported quarterly renderer
                        // (columns derived from the data, brand-accented figures);
                        // every other type keeps this file's own SectionBody.
                        isDocument ? (
                          <SectionContent section={body} />
                        ) : (
                          <EarningsSectionContent section={body} coverTemplateKey={coverTemplateKey} />
                        )
                      ) : bodiesLoading ? (
                        <SectionBodySkeleton />
                      ) : (
                        <div style={{ fontSize: 12.5, color: "#9BA3C4", fontStyle: "italic" }}>
                          {hasBodySource
                            ? "This section hasn't been generated yet."
                            : "This report keeps no section text — open the report to see its data."}
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
              </div>

              {/* Report-level comments (section_id: null) */}
              {!viewOnly && (
              <div style={{ ...CARD, padding: "16px 20px", maxWidth: isDocument ? DOC_WIDTH : undefined, margin: isDocument ? "16px auto 0" : undefined }}>
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
                  {canComment && (
                    <button
                      type="button"
                      style={BTN_SECONDARY}
                      onClick={() => (composerFor === null ? setComposerFor(undefined) : openComposer(null))}
                    >
                      {composerFor === null ? "Cancel" : "Add comment"}
                    </button>
                  )}
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
              )}
            </div>

            {/* Right rail — the review's controls when there is a review on,
                and the comments list either way. */}
            {showRail && (
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
              {/* Assignment + reassign — review controls. Nothing is assigned
                  on a report that was sent back, so this is the reviewer's. */}
              {!viewOnly && (
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
                      {reassignable.map((m) => (
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
              )}

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
                  allComments.map((c) => (
                    <CommentRow
                      key={c.id}
                      comment={c}
                      showSection
                      // Report-level comments have no section to scroll to.
                      onJump={c.section_id ? () => jumpToSection(c.section_id!) : undefined}
                    />
                  ))
                )}
              </div>

              {/* Actions. Order matters: a finished report is "review complete"
                  for everyone (the backend also flips can_act to false), so check
                  that before the not-the-reviewer messaging. Skipped entirely for
                  a reader with no review on — "only the assigned reviewer can
                  approve" is noise when nobody is assigned. */}
              {viewOnly ? null : reviewClosed ? (
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
                            opacity: busy ? 0.6 : 1,
                          }}
                          disabled={busy}
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

                      {!isOwner && (
                      <button
                        type="button"
                        style={{ ...BTN_SECONDARY, width: "100%", gap: 8, padding: "12px 16px" }}
                        // Straight to it: what needs changing is in the section
                        // comments this reviewer has been leaving, and a second
                        // required box only got "see comments" typed into it.
                        onClick={() => {
                          setNote("")
                          setActionError(null)
                          void runPanelAction("send_back")
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M9.5 1.9l2.6 2.6-7 7-3.1.5.5-3.1 7-7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                        </svg>
                        {/* It goes to the report's creator — nobody is
                            reassigned, the assignment is simply cleared. */}
                        {data?.owner?.full_name
                          ? `Send back to ${data.owner.full_name}`
                          : "Send back to the creator"}
                      </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
