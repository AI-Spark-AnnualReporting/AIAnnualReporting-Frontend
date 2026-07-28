"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
  communicationsApi,
  type ReportHubResponse,
  type ThreadDetailResponse,
} from "@/lib/api/communications"
import { ShareReportModal } from "./ShareReportModal"
import { ReviewThreadModal } from "./ReviewThreadModal"
import { ReviewerView } from "./ReviewerView"
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  RAIL_LABEL,
  abbreviateName,
  detailMessage,
  statusOf,
} from "./shared"

/**
 * Communication Hub side rail for a single report.
 *
 * GET /reports/{id}/hub renders the whole panel in one call — re-fetch after
 * any action. The status radio group is built from `statuses`; never hardcode
 * the four options.
 *
 * Approved is deliberately not settable here: approving happens in the reviewer
 * view so a sign-off is recorded (the API answers 403). It's rendered disabled
 * unless the report is already approved.
 */

const APPROVED = "approved"

const ICON_LOCK = (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <rect x="3" y="6" width="8" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.4" />
    <path d="M4.7 6V4.6a2.3 2.3 0 0 1 4.6 0V6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)

export function ReportHubPanel({ reportId }: { reportId: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hub, setHub] = useState<ReportHubResponse | null>(null)
  const [savingStatus, setSavingStatus] = useState(false)

  const [showShare, setShowShare] = useState(false)
  const [openThread, setOpenThread] = useState(false)
  // Payload handed over by share so the thread paints without a refetch.
  const [sharePayload, setSharePayload] = useState<ThreadDetailResponse | undefined>(undefined)
  const [reviewThreadId, setReviewThreadId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await communicationsApi.reportHub(reportId)
      setHub(res)
      setError(null)
    } catch (e) {
      if (statusOf(e) === 401) return
      setError(detailMessage(e, "Could not load the review panel."))
    } finally {
      setLoading(false)
    }
  }, [reportId])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  const setStatus = async (status: string) => {
    if (!hub || savingStatus || status === hub.report.status) return
    setSavingStatus(true)
    try {
      await communicationsApi.setReportStatus(reportId, status)
      await load()
    } catch (e) {
      if (statusOf(e) === 401) return
      // 403 on "approved" carries the "approve from the reviewer view" message.
      toast.error(detailMessage(e, "Could not change the status."))
    } finally {
      setSavingStatus(false)
    }
  }

  const label = <div style={RAIL_LABEL}>Review &amp; approval</div>

  if (loading) {
    return (
      <div style={{ ...CARD, padding: "14px 16px" }}>
        {label}
        <div style={{ fontSize: 12, color: "#9BA3C4" }}>Loading…</div>
      </div>
    )
  }

  if (error || !hub) {
    return (
      <div style={{ ...CARD, padding: "14px 16px" }}>
        {label}
        <div style={{ fontSize: 12, color: "#DC2626", marginBottom: 10 }}>{error}</div>
        <button type="button" style={{ ...BTN_SECONDARY, width: "100%" }} onClick={() => void load()}>
          Retry
        </button>
      </div>
    )
  }

  const { report, statuses, can_set_status, owner, thread_id, assignment, unread_count } = hub
  const isApproved = report.status === APPROVED

  return (
    <>
      <div style={{ ...CARD, padding: "14px 16px" }}>
        {label}

        {/* Status radio group — built from the API, never hardcoded. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {statuses.map((s) => {
            const selected = s.code === report.status
            // Approving is a sign-off — it happens in the reviewer view only.
            const disabled = !can_set_status || savingStatus || (s.code === APPROVED && !isApproved)
            return (
              <button
                key={s.code}
                type="button"
                disabled={disabled}
                onClick={() => void setStatus(s.code)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  textAlign: "left",
                  padding: "9px 11px",
                  borderRadius: 10,
                  fontFamily: "inherit",
                  transition: ".15s",
                  border: selected ? "1.5px solid #4040C8" : "1.5px solid #E5E7EF",
                  background: selected ? "#F5F4FF" : "#fff",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled && !selected ? 0.55 : 1,
                }}
              >
                <span
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: "50%",
                    flexShrink: 0,
                    marginTop: 1,
                    border: selected ? "4.5px solid #4040C8" : "1.6px solid #CBD0E4",
                    transition: ".15s",
                  }}
                />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#1A1D2E" }}>
                    {s.label}
                  </span>
                  <span style={{ display: "block", fontSize: 11, color: "#8890AE", marginTop: 1 }}>{s.hint}</span>
                </span>
              </button>
            )
          })}
        </div>

        {!can_set_status && (
          <div style={{ fontSize: 11.5, color: "#8890AE", marginTop: 8 }}>
            {report.status_label} — this report is read-only.
          </div>
        )}

        {/* Owner + current assignment */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #ECEEF8", fontSize: 11.5, color: "#8890AE", lineHeight: 1.6 }}>
          {owner && (
            <div>
              Owner:{" "}
              <span style={{ fontWeight: 700, color: "#5A6080" }}>
                {abbreviateName(owner.full_name)}
                {owner.is_you && " (you)"}
              </span>
            </div>
          )}
          {assignment ? (
            <div>
              With{" "}
              <span style={{ fontWeight: 700, color: "#5A6080" }}>
                {assignment.full_name}
                {assignment.is_you && " (you)"}
              </span>
              {assignment.label && ` as ${assignment.label}`}
            </div>
          ) : (
            <div>Not yet shared for review.</div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          <button type="button" style={{ ...BTN_PRIMARY, width: "100%" }} onClick={() => setShowShare(true)}>
            {thread_id ? "Share again" : "Share for review"}
          </button>

          {thread_id && (
            <button
              type="button"
              onClick={() => {
                setSharePayload(undefined)
                setOpenThread(true)
              }}
              style={{ ...BTN_SECONDARY, width: "100%", gap: 7 }}
            >
              <span style={{ color: "#7C3AED", display: "inline-flex" }}>{ICON_LOCK}</span>
              Discuss
              {unread_count > 0 && (
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
                  {unread_count}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {showShare && (
        <ShareReportModal
          reportId={reportId}
          report={report}
          onClose={() => setShowShare(false)}
          onShared={(payload) => {
            // Share returns the full thread payload — open it straight away.
            setSharePayload(payload)
            setOpenThread(true)
            void load()
          }}
        />
      )}

      {openThread && (thread_id || sharePayload) && (
        <ReviewThreadModal
          threadId={sharePayload?.thread.thread_id ?? thread_id!}
          initialPayload={sharePayload}
          onClose={() => {
            setOpenThread(false)
            setSharePayload(undefined)
            void load()
          }}
          onOpenReview={(id) => {
            setOpenThread(false)
            setSharePayload(undefined)
            setReviewThreadId(id)
          }}
        />
      )}

      {reviewThreadId && (
        <ReviewerView
          threadId={reviewThreadId}
          onClose={() => {
            setReviewThreadId(null)
            void load()
          }}
          // Back chevron → return to the thread we came from.
          onBack={() => {
            setReviewThreadId(null)
            setOpenThread(true)
          }}
          onChanged={() => void load()}
        />
      )}
    </>
  )
}
