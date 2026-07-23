"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  communicationsApi,
  type CommunicationMember,
  type ShareReportResponse,
  type ThreadReport,
} from "@/lib/api/communications"
import { AttachedReportCard } from "./AttachedReportCard"
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  INPUT,
  MODAL,
  OVERLAY,
  SECTION_LABEL,
  Spinner,
  detailMessage,
  statusOf,
} from "./shared"

/**
 * Share-for-review modal.
 *
 * A review is always assigned to a real person, so this sends a `users.id`
 * UUID from GET /communications/members as `assigned_to`.
 *
 * POST /reports/{id}/share does everything in one call and returns the full
 * review-thread payload, which we hand to the caller so the thread modal can
 * paint without a second request.
 */
export function ShareReportModal({
  reportId,
  report,
  onClose,
  onShared,
}: {
  reportId: string
  // The report being shared — drives the "Attached report" block.
  report?: ThreadReport
  onClose: () => void
  onShared?: (payload: ShareReportResponse) => void
}) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [members, setMembers] = useState<CommunicationMember[]>([])

  const [assignedTo, setAssignedTo] = useState<string | null>(null)
  const [comment, setComment] = useState("")

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Bumped by Retry to re-run the fetch below.
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    communicationsApi
      .members()
      .then((res) => {
        if (!cancelled) setMembers(res.members)
      })
      .catch((e) => {
        if (cancelled) return
        // 401 → the client interceptor already bounced to login.
        if (statusOf(e) === 401) return
        setLoadError("Could not load members. Please try again.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const retryMembers = () => {
    setLoading(true)
    setLoadError(null)
    setReloadKey((k) => k + 1)
  }


  const canSubmit = !!assignedTo && !submitting

  const submit = async () => {
    if (!assignedTo || submitting) return
    setSubmitting(true)
    setFormError(null)
    try {
      const res = await communicationsApi.shareReport(reportId, {
        assigned_to: assignedTo,
        comment: comment.trim() || undefined,
      })
      toast.success("Shared for review", { description: "The reviewer has been notified." })
      onShared?.(res)
      onClose()
    } catch (e) {
      if (statusOf(e) === 401) return
      // 422 (assigned to yourself), 403 (not an active member), 404 (no report)
      // all carry a user-facing detail string.
      setFormError(detailMessage(e, "Something went wrong. Please try again."))
      setSubmitting(false)
    }
  }

  return (
    <div style={OVERLAY} onClick={onClose}>
      <div style={{ ...MODAL, width: 640 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "20px 22px 16px" }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 11,
              background: "linear-gradient(150deg,#5B5BF0,#4040C8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 4px 12px rgba(64,64,200,.28)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
              <path d="M4.7 6V4.6a2.3 2.3 0 0 1 4.6 0V6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
              <rect x="3" y="6" width="8" height="6" rx="1.3" stroke="#fff" strokeWidth="1.6" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: "#9BA3C4", letterSpacing: ".9px" }}>
              SHARE · FOR REVIEW
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#1A1D2E", marginTop: 2, letterSpacing: "-.2px" }}>
              Share for review
            </div>
            <div style={{ fontSize: 12.5, color: "#8890AE", marginTop: 3 }}>Choose who signs this off</div>
          </div>
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
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={{ padding: "0 22px 4px", maxHeight: "60vh", overflowY: "auto" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "48px 0" }}>
              <Spinner />
              <div style={{ fontSize: 12, color: "#9BA3C4", fontWeight: 600 }}>Loading members…</div>
            </div>
          ) : loadError ? (
            <div style={{ padding: "40px 0", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "#DC2626", marginBottom: 12 }}>{loadError}</div>
              <button type="button" style={BTN_SECONDARY} onClick={retryMembers}>
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* The report the review is about — linked, never copied. */}
              {report && (
                <>
                  <div style={SECTION_LABEL}>ATTACHED REPORT</div>
                  <div style={{ marginBottom: 20 }}>
                    <AttachedReportCard report={report} />
                  </div>
                </>
              )}

              {/* The assignment — always a real person. */}
              <div style={SECTION_LABEL}>ASSIGN TO</div>
              <select
                className="chub-inp"
                value={assignedTo ?? ""}
                onChange={(e) => {
                  setAssignedTo(e.target.value || null)
                  if (formError) setFormError(null)
                }}
                style={{ ...INPUT, marginBottom: 20 }}
              >
                <option value="">Choose a person…</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} · {m.display_role}
                  </option>
                ))}
              </select>

              <div style={SECTION_LABEL}>COMMENT (OPTIONAL)</div>
              <textarea
                className="chub-inp"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Please review and sign off ahead of publication."
                style={{ ...INPUT, minHeight: 84, resize: "vertical", lineHeight: 1.5 }}
              />

              {formError && (
                <div style={{ fontSize: 11.5, fontWeight: 600, marginTop: 7, color: "#DC2626" }}>{formError}</div>
              )}
              {!formError && !assignedTo && (
                <div style={{ fontSize: 11.5, fontWeight: 600, marginTop: 7, color: "#9BA3C4" }}>
                  Choose a person to assign the review to.
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "18px 22px 20px" }}>
          <button type="button" style={BTN_SECONDARY} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            style={{ ...BTN_PRIMARY, gap: 7, opacity: canSubmit ? 1 : 0.55, cursor: canSubmit ? "pointer" : "not-allowed" }}
            disabled={!canSubmit}
            onClick={submit}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M12.5 1.5L6 8M12.5 1.5L8.3 12.5l-2.3-4.5L1.5 5.7 12.5 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
            {submitting ? "Starting…" : "Start review thread"}
          </button>
        </div>
      </div>
    </div>
  )
}
