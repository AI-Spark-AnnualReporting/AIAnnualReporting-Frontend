"use client"

import { useState } from "react"
import { toast } from "sonner"
import { BTN_PRIMARY, BTN_SECONDARY, CARD, RAIL_LABEL } from "@/components/communication/review/shared"
import { Skeleton } from "@/components/ui/skeletons"
import { formatDateTime } from "@/lib/utils"
import type { ReportReviewState, ReportShare, VersionSummary } from "@/lib/api/reportReview"
import { useResendReportLink } from "@/hooks/useReportReview"
import { jumpToReportSection } from "@/components/report/FinalReportView"
import { ShareWithClientDialog } from "./ShareWithClientDialog"
import { VersionHistory } from "./VersionHistory"

/**
 * The "Client review" rail card on the Report page.
 *
 * Everyone sees where the client review is and the client's comments. Only
 * Spark gets Share / Resend; the server refuses them for anyone else.
 */

const INK = "#1A1D2E"
const MUTED = "#5A6080"
const SOFT = "#8890AE"
const MAX_RESENDS = 3

const SHARE_TEXT: Record<ReportShare["status"], { label: string; color: string }> = {
  pending: { label: "With the client", color: "#D97706" },
  changes_requested: { label: "Changes requested", color: "#DC2626" },
  approved: { label: "Approved by client", color: "#16A34A" },
  revoked: { label: "Link withdrawn", color: "#8890AE" },
}

/** What Spark is allowed to do next, and why not when nothing is. */
function shareAvailability(
  state: ReportReviewState,
  latest: VersionSummary | undefined,
  locked: boolean,
  arabic: boolean,
): { canShare: boolean; reason: string | null } {
  // The English report is always locked by the time the Arabic exists, so the
  // lock only stops sharing the English one.
  if (locked && !arabic) return { canShare: false, reason: null }
  if (state.awaiting_client) return { canShare: false, reason: null }
  // English, before the first share: validated and every finding fixed or ignored.
  if (!arabic && state.validation_blocker) return { canShare: false, reason: state.validation_blocker }
  if (latest && latest.status === "approved") return { canShare: false, reason: null }
  if (latest && latest.status === "changes_requested") {
    const redo = arabic ? "Edit the Arabic report" : "Edit the report"
    return {
      canShare: false,
      reason: `${redo} to make version ${latest.version_no + 1}, then share it.`,
    }
  }
  return { canShare: true, reason: null }
}

export function ClientReviewCard({
  cycleId,
  state,
  isSpark,
  locked,
  arabic = false,
}: {
  cycleId: string
  state: ReportReviewState
  isSpark: boolean
  /** The report is approved & locked (by the client or Approve & Lock). */
  locked: boolean
  /** This card is for the Arabic translation, with its own link and versions. */
  arabic?: boolean
}) {
  const [shareOpen, setShareOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const resend = useResendReportLink(cycleId, arabic)

  const share = state.share
  const latest = state.versions[0]
  const { canShare, reason } = shareAvailability(state, latest, locked, arabic)
  const nextVersionNo = latest && latest.status === "draft" ? latest.version_no : (latest?.version_no ?? 0) + 1
  const shareText = share ? SHARE_TEXT[share.status] : null
  const comments = latest ? latest.comments : []
  const resendsLeft = share ? MAX_RESENDS - share.reminder_count : 0

  const copyLink = async () => {
    if (!share?.url) return
    try {
      await navigator.clipboard.writeText(share.url)
      toast.success("Link copied.")
    } catch {
      toast.error("Couldn't copy. Select the link and copy it by hand.")
    }
  }

  return (
    <>
      <div style={{ ...CARD, padding: "14px 16px" }}>
        <div style={RAIL_LABEL}>Client review</div>

        {shareText && share ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: shareText.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{shareText.label}</span>
              {state.label && (
                <span style={{ fontSize: 12, color: MUTED, marginLeft: 2 }}>· v{latest?.version_no}</span>
              )}
            </div>
            <div style={{ marginTop: 10, fontSize: 11.5, color: SOFT, lineHeight: 1.6 }}>
              <div>
                Sent to <span style={{ fontWeight: 700, color: MUTED }}>{share.client_email}</span>
              </div>
              {latest?.shared_at && <div>Sent {formatDateTime(latest.shared_at)}</div>}
              {share.status === "pending" && (
                <>
                  <div>{share.viewed_at ? `Opened ${formatDateTime(share.viewed_at)}` : "Not opened yet"}</div>
                  {share.email_status === "failed" && (
                    <div style={{ color: "#DC2626" }}>The email didn&apos;t send. Use Resend for a new link.</div>
                  )}
                </>
              )}
              {latest?.decided_at && share.status !== "pending" && (
                <div>Answered {formatDateTime(latest.decided_at)}</div>
              )}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: SOFT }}>Not sent to the client yet.</div>
        )}

        {/* The client's answer: their note and comments on the latest version. */}
        {latest?.decision_note && (
          <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 10, background: "#F5F4FF", fontSize: 12, color: INK }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: SOFT, marginBottom: 2 }}>Their note</div>
            {latest.decision_note}
          </div>
        )}
        {comments.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: SOFT, marginBottom: 6 }}>
              Comments ({comments.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {comments.map((comment) => {
                const code = comment.section_code
                const box = { padding: "8px 10px", borderRadius: 10, border: "1px solid #ECEEF8", fontSize: 12, color: INK, whiteSpace: "pre-wrap" as const }
                const label = (
                  <div dir="auto" style={{ fontSize: 10.5, fontWeight: 700, color: code ? "#4F46E5" : SOFT, marginBottom: 2 }}>
                    {comment.section_title ?? "Whole report"}
                  </div>
                )
                // A comment on a section jumps the report to it; one on the
                // whole report has nowhere to go.
                if (!code) {
                  return <div key={comment.id} style={box}>{label}{comment.body}</div>
                }
                return (
                  <button
                    key={comment.id}
                    type="button"
                    onClick={() => jumpToReportSection(code)}
                    title={`Go to ${comment.section_title ?? "this section"}`}
                    style={{ ...box, textAlign: "left", background: "transparent", cursor: "pointer", width: "100%" }}
                  >
                    {label}
                    {comment.body}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Same as the strategic brief: Spark can copy the live link again. */}
        {isSpark && share?.url && (
          <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 10, background: "#F5F4FF" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: SOFT, marginBottom: 2 }}>Their link</div>
            <div style={{ fontSize: 11.5, color: INK, fontFamily: "monospace", wordBreak: "break-all" }}>{share.url}</div>
          </div>
        )}

        {reason && <div style={{ marginTop: 10, fontSize: 11.5, color: MUTED }}>{reason}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {isSpark && canShare && (
            <button type="button" style={{ ...BTN_PRIMARY, width: "100%" }} onClick={() => setShareOpen(true)}>
              {latest ? `Share version ${nextVersionNo} with client` : "Share with client"}
            </button>
          )}
          {isSpark && share?.url && (
            <button type="button" style={{ ...BTN_SECONDARY, width: "100%" }} onClick={copyLink}>
              Copy link
            </button>
          )}
          {isSpark && share?.status === "pending" && state.awaiting_client && (
            <button
              type="button"
              style={{ ...BTN_SECONDARY, width: "100%", opacity: resendsLeft > 0 ? 1 : 0.55 }}
              disabled={resend.isPending || resendsLeft <= 0}
              onClick={() => resend.mutate()}
              title={resendsLeft > 0 ? "Emails a new link; the old one stops working." : "Already resent 3 times."}
            >
              {resend.isPending ? "Resending…" : "Resend link"}
            </button>
          )}
          {state.versions.length > 0 && (
            <button type="button" style={{ ...BTN_SECONDARY, width: "100%" }} onClick={() => setHistoryOpen(true)}>
              History
            </button>
          )}
        </div>
      </div>

      {isSpark && (
        <ShareWithClientDialog
          cycleId={cycleId}
          open={shareOpen}
          onOpenChange={setShareOpen}
          suggestedEmail={share?.client_email}
          versionLabel={`${arabic ? "Arabic version" : "Version"} ${nextVersionNo || 1}`}
          arabic={arabic}
        />
      )}

      <VersionHistory
        cycleId={cycleId}
        versions={state.versions}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        arabic={arabic}
      />
    </>
  )
}

/** The card's shape while the client review loads: label, status, dates, buttons. */
export function ClientReviewCardSkeleton() {
  return (
    <div style={{ ...CARD, padding: "14px 16px" }} aria-busy="true" aria-label="Loading the client review">
      <div style={RAIL_LABEL}>Client review</div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="mt-3 h-9 w-full rounded-xl" />
        <Skeleton className="h-9 w-full rounded-xl" />
      </div>
    </div>
  )
}
