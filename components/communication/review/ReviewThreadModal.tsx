"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useAuth } from "@/contexts/AuthContext"
import {
  communicationsApi,
  type CommunicationMember,
  type ThreadDetail,
  type ThreadDetailResponse,
  type ThreadMessage,
} from "@/lib/api/communications"
import { AttachedReportCard } from "./AttachedReportCard"
import {
  BADGE_GRAY,
  BTN_PRIMARY,
  BTN_SECONDARY,
  MODAL,
  OVERLAY,
  SECTION_LABEL,
  MentionComposer,
  Spinner,
  initials,
  relativeTime,
  roleLabel,
  statusOf,
} from "./shared"

/**
 * Review thread — opens from the hub panel's Discuss button, a thread row, or a
 * notification deep-link.
 *
 * The attached-report card is load-bearing: without it the assigned reviewer
 * opens the thread and can't tell which report they've been asked to review.
 * Clicking it goes straight to the reviewer screen.
 *
 * `kind` drives the bubble: "system" renders as the Communication Hub itself
 * (ignore `sender` for the display name — it's the actor, kept for audit);
 * "user" renders as a person.
 */

const ICON_SHARE = (
  <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
    <circle cx="13.4" cy="4.2" r="2.1" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="4.6" cy="9" r="2.1" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="13.4" cy="13.8" r="2.1" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6.5 7.9l5-2.6M6.5 10.1l5 2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

const ICON_EXTERNAL = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M5.6 2.6H2.9a.9.9 0 0 0-.9.9v7.6a.9.9 0 0 0 .9.9h7.6a.9.9 0 0 0 .9-.9V8.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M8.2 2.3h3.5v3.5M11.4 2.6L6.6 7.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const ICON_CHECK_CIRCLE = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="8.4" fill="#16A34A" />
    <path d="M6.4 10.2l2.4 2.4 4.8-4.8" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

function MessageRow({ message }: { message: ThreadMessage }) {
  const { sender, body, created_at, kind } = message
  const isSystem = kind === "system"

  return (
    <div style={{ display: "flex", gap: 11, padding: "9px 0" }}>
      {isSystem ? (
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            flexShrink: 0,
            background: "#EFF0F7",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", border: "2px solid #8890AE" }} />
        </span>
      ) : (
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            flexShrink: 0,
            background: sender.is_you ? "linear-gradient(150deg,#5B5BF0,#4040C8)" : "#EEEEFF",
            color: sender.is_you ? "#fff" : "#4040C8",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          {initials(sender.full_name)}
        </span>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
          {isSystem ? (
            <span style={{ fontSize: 13, fontWeight: 800, color: "#1A1D2E" }}>Communication Hub</span>
          ) : (
            <>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#1A1D2E" }}>
                {sender.full_name}
                {sender.is_you && sender.full_name.trim().toLowerCase() !== "you" && " (you)"}
              </span>
              <span style={BADGE_GRAY}>{roleLabel(sender.role)}</span>
            </>
          )}
          <span style={{ fontSize: 11.5, color: "#9BA3C4" }}>{relativeTime(created_at)}</span>
        </div>
        <div
          style={{
            padding: "10px 13px",
            borderRadius: 10,
            background: isSystem ? "#F4F4FB" : "#F6F7FC",
            fontSize: 13,
            color: "#3A4066",
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {body}
        </div>
      </div>
    </div>
  )
}

export function ReviewThreadModal({
  threadId,
  onClose,
  initialPayload,
  onOpenReview,
}: {
  threadId: string
  onClose: () => void
  // Share returns the full thread payload — pass it to paint without a refetch.
  // Its presence also means "just shared", which shows the success banner.
  initialPayload?: ThreadDetailResponse
  // Opens the reviewer screen. The view itself is readable by any company
  // member; it self-gates the write actions on can_act / can_approve.
  onOpenReview?: (threadId: string) => void
}) {
  const { user } = useAuth()

  const justShared = !!initialPayload

  const [loading, setLoading] = useState(!initialPayload)
  const [error, setError] = useState<string | null>(null)
  const [thread, setThread] = useState<ThreadDetail | null>(initialPayload?.thread ?? null)
  const [messages, setMessages] = useState<ThreadMessage[]>(initialPayload?.messages ?? [])
  const [members, setMembers] = useState<CommunicationMember[]>([])

  const [message, setMessage] = useState("")
  const [mentions, setMentions] = useState<CommunicationMember[]>([])
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  // On open → load thread + members in parallel, and fire read (idempotent).
  // With initialPayload the thread is already painted; we still refresh members
  // for the mention picker and mark the thread read.
  useEffect(() => {
    let cancelled = false
    const skipThreadFetch = !!initialPayload
    if (!skipThreadFetch) {
      setLoading(true)
      setError(null)
    }

    Promise.all([
      skipThreadFetch ? Promise.resolve(null) : communicationsApi.getThread(threadId),
      // A members failure shouldn't block the thread from rendering.
      communicationsApi.members().catch(() => ({ members: [] as CommunicationMember[] })),
    ])
      .then(([detail, membersRes]) => {
        if (cancelled) return
        if (detail) {
          setThread(detail.thread)
          setMessages(detail.messages)
        }
        setMembers(membersRes.members)
      })
      .catch((e) => {
        if (cancelled) return
        if (statusOf(e) === 401) return
        if (statusOf(e) === 404) {
          toast.error("That conversation is no longer available")
          onClose() // parent refreshes the list
          return
        }
        setError("Could not load this conversation. Please try again.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    // Clear the "N new" badge — idempotent, don't block the view on it.
    communicationsApi.markThreadRead(threadId).catch(() => {})

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId])

  // A reply must be addressed to at least one participant.
  const hasMessage = message.trim().length > 0
  const needsRecipient = hasMessage && mentions.length === 0
  const canSend = hasMessage && mentions.length > 0 && !sending

  const sendReply = async () => {
    const text = message.trim()
    if (!text || sending) return
    if (mentions.length === 0) {
      setSendError("Add at least one participant with @ before sending.")
      return
    }
    setSending(true)
    setSendError(null)
    try {
      const res = await communicationsApi.sendMessage(threadId, {
        message: text,
        mentioned_user_ids: mentions.map((m) => m.id), // UUIDs, not user_id
      })
      setMessages((prev) => [...prev, res.message])
      setMessage("")
      setMentions([])
      setSending(false)
    } catch (e) {
      switch (statusOf(e)) {
        case 422:
          setSendError("Message can't be empty")
          setSending(false)
          break
        case 404:
          toast.error("That conversation is no longer available")
          onClose()
          return
        case 403:
          toast.error("One of the mentioned people is no longer available")
          communicationsApi
            .members()
            .then((r) => setMembers(r.members))
            .catch(() => {})
          setSending(false)
          break
        case 401:
          setSending(false)
          break
        default:
          setSendError("Something went wrong. Please try again.")
          setSending(false)
      }
    }
  }

  const report = thread?.report
  const assignment = thread?.assignment ?? null
  const assignedName = assignment ? (assignment.label ?? assignment.full_name) : null
  const openReview = onOpenReview ? () => onOpenReview(threadId) : undefined

  return (
    <div style={OVERLAY} onClick={onClose}>
      <div
        style={{
          ...MODAL,
          width: 660,
          maxHeight: "min(88vh, 780px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "18px 22px 16px" }}>
          <span
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
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
            <div style={{ fontSize: 16.5, fontWeight: 800, color: "#1A1D2E", letterSpacing: "-.2px" }}>
              Review thread
            </div>
            <div style={{ fontSize: 12.5, color: "#8890AE", marginTop: 1 }}>Shared and assigned for review</div>
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

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 22px 4px", borderTop: "1px solid #ECEEF8" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "56px 0" }}>
              <Spinner />
              <div style={{ fontSize: 12, color: "#9BA3C4", fontWeight: 600 }}>Loading conversation…</div>
            </div>
          ) : error ? (
            <div style={{ padding: "48px 0", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "#DC2626" }}>{error}</div>
            </div>
          ) : (
            <>
              {/* Just-shared confirmation */}
              {justShared && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 11,
                    padding: "13px 15px",
                    borderRadius: 12,
                    background: "#ECFDF3",
                    border: "1px solid #C7EED8",
                    marginTop: 16,
                  }}
                >
                  <span style={{ flexShrink: 0, display: "inline-flex", marginTop: 1 }}>{ICON_CHECK_CIRCLE}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: "#15803D" }}>
                      Review thread started
                    </span>
                    <span style={{ display: "block", fontSize: 12.5, color: "#3F9E66", marginTop: 2 }}>
                      {assignedName ? `Shared with ${assignedName} · assigned for review` : "Assigned for review"}
                    </span>
                  </span>
                </div>
              )}

              {/* The report under review — clicking opens the reviewer screen. */}
              {report && (
                <div style={{ marginTop: 14 }}>
                  <AttachedReportCard
                    report={report}
                    subtitle={openReview ? "Linked · click to open in review" : "Linked · read-only snapshot"}
                    onClick={openReview}
                  />
                </div>
              )}

              <div style={{ ...SECTION_LABEL, marginTop: 18, marginBottom: 4 }}>THREAD</div>

              {messages.length === 0 ? (
                <div style={{ padding: "32px 0", textAlign: "center", fontSize: 13, color: "#9BA3C4" }}>
                  No messages yet.
                </div>
              ) : (
                messages.map((m) => <MessageRow key={m.id} message={m} />)
              )}

              {/* Reply composer */}
              <div style={{ marginTop: 12, paddingTop: 14, borderTop: "1px solid #ECEEF8" }}>
                <MentionComposer
                  members={members}
                  currentUserId={user?.user_id}
                  message={message}
                  onMessageChange={(v) => {
                    setMessage(v)
                    if (sendError) setSendError(null)
                  }}
                  mentions={mentions}
                  onMentionsChange={setMentions}
                  placeholder="Write a reply…  (type @ to mention)"
                  minHeight={70}
                />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 10 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: sendError ? "#DC2626" : "#9BA3C4" }}>
                    {sendError ?? (needsRecipient ? "Add at least one participant with @ to send." : "")}
                  </span>
                  <button
                    type="button"
                    style={{ ...BTN_PRIMARY, gap: 7, opacity: canSend ? 1 : 0.55, cursor: canSend ? "pointer" : "not-allowed" }}
                    disabled={!canSend}
                    onClick={sendReply}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M12.5 1.5L6 8M12.5 1.5L8.3 12.5l-2.3-4.5L1.5 5.7 12.5 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                    </svg>
                    {sending ? "Sending…" : "Send"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "16px 22px 18px",
            borderTop: "1px solid #ECEEF8",
          }}
        >
          <button type="button" style={BTN_SECONDARY} onClick={onClose}>
            Close
          </button>
          {openReview && thread && !loading && !error && (
            <button type="button" style={{ ...BTN_PRIMARY, gap: 8 }} onClick={openReview}>
              {thread.can_review ? "Open as reviewer" : "Open review"}
              {ICON_EXTERNAL}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
