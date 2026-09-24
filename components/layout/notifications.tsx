"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, X } from "lucide-react"
import {
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/hooks/useNotifications"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useAuth } from "@/contexts/AuthContext"
import { communicationsApi, type ThreadSummary } from "@/lib/api/communications"
import { centriyonUrl } from "@/lib/centriyon"
import {
  isReadinessNotification,
  reportKind,
} from "@/lib/reportReadiness"
import { Notification } from "@/types"
import { formatDistanceToNow } from "date-fns"

/* ══════════════════════════════════════════════════════════════════════
   Notification bell — redesigned to match the Centriyon IR app.

   One clean, type-driven list. Every item carries a `kind` that maps to
   presentation (icon + accent) via KIND_META and to a click action. Adding
   a new kind later is: extend NotificationKind, add a KIND_META entry, emit
   items for it. The panel, badge, empty state, and click-through are generic.

   Sources today:
     • escalation / regular — the live backend feed (passed in as props)
     • thread_message      — the Communication Hub feed (fetched here), whose
                             rows deep-link to the thread on the role's hub.
     • report_not_ready    — a report Centriton could not prepare for the AI
                             assistant. Written by Centriton into the SHARED
                             notifications table; carries an in-row "Try again"
                             that calls Centriton's backend directly.
═══════════════════════════════════════════════════════════════════════ */

// ── Message parsing (still used by the escalation banner) ──────────────────
function parseMessage(raw: string): { intro: string; rows: { key: string; value: string }[] } {
  const rows: { key: string; value: string }[] = []
  let intro = ""
  for (const line of raw.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const colon = line.indexOf(":")
    if (colon > 0) {
      const key = line.slice(0, colon).trim()
      const value = line.slice(colon + 1).trim()
      if (key.toLowerCase() !== "priority") rows.push({ key, value })
    } else {
      intro = line
    }
  }
  return { intro, rows }
}

// Escalation "reason" / "department" pulled out of the structured message.
function escalationParts(n: Notification): { dept: string; reason: string } {
  const { rows } = parseMessage(n.message)
  const dept =
    rows.find((r) => r.key.toLowerCase() === "department")?.value ||
    n.title?.replace(/^escalation[^:]*:\s*/i, "") ||
    ""
  const reason = rows.find((r) => r.key.toLowerCase() === "reason")?.value || ""
  return { dept, reason }
}

function relativeTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return formatDistanceToNow(d, { addSuffix: true })
}

// ── Notification model ─────────────────────────────────────────────────────
type NotificationKind = "escalation" | "thread_message" | "regular" | "report_not_ready"

interface KindMeta {
  accent: string // icon tint + unread dot
  bg: string // icon tile background
  icon: ReactNode
}

const KIND_META: Record<NotificationKind, KindMeta> = {
  escalation: {
    accent: "#DC2626",
    bg: "#FEE9E9",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 2.2l6 10.4H2L8 2.2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M8 6.4v3M8 11.1v.05" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  thread_message: {
    accent: "#7C3AED",
    bg: "#F1ECFF",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M2.5 3.6A1.2 1.2 0 0 1 3.7 2.4h8.6a1.2 1.2 0 0 1 1.2 1.2v5.6a1.2 1.2 0 0 1-1.2 1.2H6l-2.9 2.4V3.6z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  report_not_ready: {
    // #B45309 is the warning ink used across both apps.
    accent: "#B45309",
    bg: "#FFF7ED",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 2.6 14.4 13H1.6L8 2.6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M8 6.6v2.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="8" cy="11.2" r=".75" fill="currentColor" />
      </svg>
    ),
  },
  regular: {
    accent: "#4040C8",
    bg: "#EEEEFF",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 2.2a3.5 3.5 0 0 0-3.5 3.5v2L3.4 9.9h9.2L11.5 7.7V5.7A3.5 3.5 0 0 0 8 2.2z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="M6.6 11.6a1.5 1.5 0 0 0 2.8 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
}

interface UnifiedNotif {
  id: string
  kind: NotificationKind
  title: string
  body?: string
  meta?: string
  timestamp: string
  unread: boolean
  onClick: () => void
  /** In-row button. Its click never opens the notification. */
  action?: { label: string; busyLabel: string; run: () => Promise<void> }
}

// Retry polling. Past the cap we stop watching rather than spin forever on a run
// whose process died — a server restart drops an in-flight background task with
// no record. Giving up is NOT a failure, so it must not claim one.
const POLL_MS = 3000
const POLL_CAP_MS = 120000


// Role → base Communication Hub path. Null for roles without a hub.
function commsBasePath(role?: string): string | null {
  if (role === "project_manager") return "/pm/communication"
  if (role === "hod") return "/hod/communication"
  if (role === "department_user") return "/department/communication"
  return null
}

// Unread escalations first, then any other unread (newest first), then read.
function sortUnified(items: UnifiedNotif[]): UnifiedNotif[] {
  const rank = (u: UnifiedNotif) => (u.kind === "escalation" ? 0 : 1)
  const byDate = (a: UnifiedNotif, b: UnifiedNotif) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  return [...items].sort((a, b) => {
    if (a.unread !== b.unread) return a.unread ? -1 : 1
    if (a.unread && rank(a) !== rank(b)) return rank(a) - rank(b)
    return byDate(a, b)
  })
}

// Scoped hover/entrance rules the inline styles can't express.
const SCOPED_CSS = `
@keyframes notifPop { from { opacity: 0; transform: translateY(-6px) scale(.98); } to { opacity: 1; transform: none; } }
.notif-row { transition: background .13s; }
.notif-row:hover { background: #F7F7FD; }
.notif-clear:hover { color: #4040C8 !important; }
.notif-action:hover:not(:disabled) { background: #FFF1DF !important; }
.notif-action:disabled { opacity: .6; cursor: default; }
`

const REFRESH_MS = 45000

// ── Notification bell (dropdown) ───────────────────────────────────────────
export function NotificationBell({
  notifications,
  onView,
  markRead,
  markAllRead,
  className,
  badgeOffsetClassName,
}: {
  notifications: Notification[]
  onView: (id: string) => void
  markRead: ReturnType<typeof useMarkNotificationRead>
  markAllRead: ReturnType<typeof useMarkAllNotificationsRead>
  /** Trigger button className override (lets each shell theme its own bell). */
  className?: string
  /** Optional override applied to the trigger when there are no escalations. */
  badgeOffsetClassName?: string
}) {
  const router = useRouter()
  const { user } = useAuth()
  const qc = useQueryClient()
  const base = commsBasePath(user?.role)

  const [open, setOpen] = useState(false)
  // Per-row, so two retries can be in flight without disabling each other.
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const wrapRef = useRef<HTMLDivElement>(null)

  // Communication Hub threads (thread_message notifications). `readThreads`
  // tracks optimistic reads so the badge/list update instantly on click.
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [readThreads, setReadThreads] = useState<Set<string>>(new Set())

  // Ad-hoc refresh (used by the open-panel handler). setState lands after the
  // await, i.e. in a microtask callback — not synchronously in render/effect.
  const loadThreads = useCallback(async () => {
    if (!base) return
    try {
      const res = await communicationsApi.listThreads()
      setThreads(res.threads)
    } catch {
      // 401 → the request layer already redirected. Other failures just leave
      // the thread section empty rather than surfacing an error.
    }
  }, [base])

  // Fetch on mount + poll in the background so the badge stays roughly live.
  // Inlined (not via loadThreads) so the effect body never calls setState
  // synchronously and doesn't depend on a changing callback identity.
  useEffect(() => {
    if (!base) return
    let cancelled = false
    const run = async () => {
      try {
        const res = await communicationsApi.listThreads()
        if (!cancelled) setThreads(res.threads)
      } catch {
        // see loadThreads
      }
    }
    void run()
    const id = window.setInterval(() => void run(), REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [base])

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  // Watch a queued retry to its end. Returns how it ended, or null if we stopped
  // watching — which is not the same as failing, so the caller must not say so.
  const watchRun = useCallback(async (pollUrl: string | null): Promise<string | null> => {
    if (!pollUrl) return null
    const started = Date.now()
    while (Date.now() - started < POLL_CAP_MS) {
      await new Promise((r) => setTimeout(r, POLL_MS))
      try {
        const run = await communicationsApi.getAgentRun(pollUrl)
        if (run.status === "completed" || run.status === "failed") return run.status
      } catch {
        // A transient poll failure is not a retry failure — keep watching.
      }
    }
    return null
  }, [])

  const runAction = async (n: UnifiedNotif) => {
    if (!n.action || busy[n.id]) return
    setBusy((prev) => ({ ...prev, [n.id]: true }))
    try {
      await n.action.run()
    } catch (err) {
      // Retrying is safe to repeat by design, so the row is left exactly as it
      // is and the button can be pressed again.
      toast.error((err as { message?: string })?.message || "Couldn't try again just now.")
    } finally {
      setBusy((prev) => {
        const next = { ...prev }
        delete next[n.id]
        return next
      })
    }
  }

  // Build the unified list from both sources. Communication notifications
  // (action_url → /communications/threads/…) are dropped here: the Comm Hub
  // thread feed below already surfaces them as richer, deep-linking cards, so
  // keeping the backend row too would double every tagged message.
  const backendItems: UnifiedNotif[] = notifications
    .filter((n) => !(n.action_url ?? "").startsWith("/communications/threads"))
    .map((n) => {
    const isEsc = n.notification_type === "escalation"
    if (isEsc) {
      const { dept, reason } = escalationParts(n)
      return {
        id: n.id,
        kind: "escalation" as const,
        title: `Escalation${dept ? ` — ${dept}` : ""}`,
        body: reason || n.message.split("\n")[0],
        meta: (n.priority ?? "normal").toUpperCase(),
        timestamp: n.created_at,
        unread: !n.is_read,
        onClick: () => {
          onView(n.id)
          setOpen(false)
          if (n.related_id) router.push(`/sessions/${n.related_id}`)
        },
      }
    }
    // A report Centriton could not get ready for the AI assistant. The row is
    // written by Centriton into this shared table and is actionable from here:
    // the button calls Centriton's backend, so the user never has to leave.
    if (isReadinessNotification(n)) {
      const kind = reportKind(n.action_url)
      const reportId = n.related_id ?? ""
      return {
        id: n.id,
        kind: "report_not_ready" as const,
        title: n.title || n.message,
        body: n.title && n.message && n.title !== n.message ? n.message : undefined,
        meta: "Needs attention",
        timestamp: n.created_at,
        unread: !n.is_read,
        onClick: () => {
          if (!n.is_read) markRead.mutate(n.id)
          setOpen(false)
          // NOT router.push: action_url is a Centriton route and a 404 here.
          // centriyonUrl carries the session across so they land signed in.
          const token = typeof window !== "undefined"
            ? localStorage.getItem("access_token")
            : null
          const href = token && n.action_url ? centriyonUrl(token, n.action_url) : null
          if (href) window.location.href = href
        },
        // No report to act on (an unparseable link) → no button. The row still
        // reads fine, it just cannot fix itself.
        action: kind && reportId ? {
          label: "Try again",
          busyLabel: "Getting it ready…",
          run: async () => {
            const res = kind === "earnings"
              ? await communicationsApi.reindexEarningsReport(reportId)
              : await communicationsApi.reindexQuarterlyReport(user?.company_id ?? "", reportId)
            const outcome = await watchRun(res.poll_url)
            // On success Centriton marks the row read, so refetching makes it
            // disappear. Prefix matching means this one key covers the list and
            // the unread count.
            qc.invalidateQueries({ queryKey: ["notifications"] })
            if (outcome === "completed") {
              toast.success("✓ The assistant can read this report now", {
                description: `${res.report_label || "Your report"} is ready — `
                  + "you can ask the assistant about it.",
              })
            }
          },
        } : undefined,
      }
    }
    return {
      id: n.id,
      kind: "regular" as const,
      title: n.title || n.message,
      body: n.title && n.message && n.title !== n.message ? n.message : undefined,
      meta: "Notification",
      timestamp: n.created_at,
      unread: !n.is_read,
      onClick: () => {
        if (!n.is_read) markRead.mutate(n.id)
        setOpen(false)
        // Deep-link when the backend attached a destination — e.g. a "draft
        // submitted" notification points the HOD at /hod/sessions/{id}/review.
        // Guarded to internal paths; comm-thread action_urls are filtered out
        // above and surfaced as their own richer cards instead.
        if (n.action_url && n.action_url.startsWith("/")) router.push(n.action_url)
      },
    }
  })

  const threadItems: UnifiedNotif[] = base
    ? threads
        .filter((t) => t.unread_count > 0 && t.last_message && !readThreads.has(t.thread_id))
        .map((t) => {
          const lm = t.last_message!
          const sender = lm.is_you ? "You" : lm.sender_full_name
          const plural = t.unread_count > 1 ? `${t.unread_count} new messages` : "1 new message"
          return {
            id: `thread:${t.thread_id}`,
            kind: "thread_message" as const,
            title: t.report?.title ?? "Conversation",
            body: `${sender}: ${lm.preview}`,
            meta: plural,
            timestamp: t.updated_at,
            unread: true,
            onClick: () => {
              setReadThreads((prev) => new Set(prev).add(t.thread_id))
              communicationsApi.markThreadRead(t.thread_id).catch(() => {})
              setOpen(false)
              router.push(`${base}?thread=${t.thread_id}`)
            },
          }
        })
    : []

  const items = sortUnified([...backendItems, ...threadItems])
  const unreadCount = items.filter((n) => n.unread).length
  const hasUnreadEsc = items.some((n) => n.kind === "escalation" && n.unread)

  const markAll = () => {
    // Backend notifications (escalation + regular).
    if (notifications.some((n) => !n.is_read)) markAllRead.mutate()
    // Thread messages — optimistic + backend.
    const unreadThreadIds = threads
      .filter((t) => t.unread_count > 0 && !readThreads.has(t.thread_id))
      .map((t) => t.thread_id)
    if (unreadThreadIds.length) {
      setReadThreads((prev) => {
        const next = new Set(prev)
        unreadThreadIds.forEach((id) => next.add(id))
        return next
      })
      unreadThreadIds.forEach((id) => communicationsApi.markThreadRead(id).catch(() => {}))
    }
  }

  const triggerClass =
    (className ??
      "relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground") +
    " inline-flex items-center justify-center" +
    (badgeOffsetClassName ? ` ${badgeOffsetClassName}` : "")

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <style>{SCOPED_CSS}</style>

      <button
        type="button"
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => {
          // Refresh on open so the panel reflects the latest read state.
          if (!open) void loadThreads()
          setOpen((v) => !v)
        }}
        className={triggerClass}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 20 20"
          fill="none"
          className={hasUnreadEsc ? "bell-shake" : ""}
        >
          <path
            d="M10 2.6a4.4 4.4 0 0 0-4.4 4.4v2.6L4.3 12.4h11.4L14.4 9.6V7A4.4 4.4 0 0 0 10 2.6z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M8.2 14.6a1.9 1.9 0 0 0 3.6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -5,
              right: -5,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: 9,
              background: "#EF4444",
              color: "#fff",
              fontSize: 9.5,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #fff",
              lineHeight: 1,
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            right: 0,
            width: 380,
            maxWidth: "calc(100vw - 32px)",
            background: "#fff",
            border: "1px solid #E9EAF4",
            borderRadius: 16,
            boxShadow: "0 18px 50px rgba(26,29,46,.18)",
            zIndex: 1000,
            overflow: "hidden",
            animation: "notifPop .16s ease-out",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "14px 16px",
              borderBottom: "1px solid #F0F1F8",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#1A1D2E", letterSpacing: "-.2px" }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span
                  style={{
                    minWidth: 18,
                    height: 18,
                    padding: "0 6px",
                    borderRadius: 9,
                    background: "#EEEEFF",
                    color: "#4040C8",
                    fontSize: 11,
                    fontWeight: 800,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                className="notif-clear"
                onClick={markAll}
                disabled={markAllRead.isPending}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#8890AE",
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  padding: 0,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {items.length === 0 ? (
              <div style={{ padding: "40px 24px", textAlign: "center" }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    margin: "0 auto 12px",
                    background: "#F2F3FA",
                    color: "#B9C0D8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path
                      d="M10 2.6a4.4 4.4 0 0 0-4.4 4.4v2.6L4.3 12.4h11.4L14.4 9.6V7A4.4 4.4 0 0 0 10 2.6z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                    <path d="M8.2 14.6a1.9 1.9 0 0 0 3.6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#5A6080" }}>You&apos;re all caught up</div>
                <div style={{ fontSize: 12, color: "#9BA3C4", marginTop: 3 }}>New activity will show up here.</div>
              </div>
            ) : (
              items.map((n) => {
                const meta = KIND_META[n.kind]
                const isBusy = !!busy[n.id]
                return (
                  // A div, not a button: a row may carry its own action button,
                  // and a button inside a button is invalid HTML that browsers
                  // silently restructure. Keyboard behaviour is kept by hand.
                  <div
                    key={n.id}
                    role="menuitem"
                    tabIndex={0}
                    className="notif-row"
                    onClick={n.onClick}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        n.onClick()
                      }
                    }}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      width: "100%",
                      textAlign: "left",
                      padding: "13px 16px",
                      borderBottom: "1px solid #F4F5FB",
                      background: n.unread ? "#FBFAFF" : "#fff",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        background: meta.bg,
                        color: meta.accent,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {meta.icon}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 13,
                            fontWeight: 700,
                            color: "#1A1D2E",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {n.title}
                        </span>
                        {n.unread && (
                          <span
                            style={{
                              flexShrink: 0,
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: meta.accent,
                            }}
                          />
                        )}
                      </div>
                      {n.body && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "#5A6080",
                            marginTop: 2,
                            // A warning is a sentence or two of plain English and
                            // is useless truncated to one line, unlike a message
                            // preview which is only ever a teaser.
                            ...(n.kind === "report_not_ready"
                              ? { lineHeight: 1.45 }
                              : {
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap" as const,
                                }),
                          }}
                        >
                          {n.body}
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 5 }}>
                        {n.meta && <span style={{ fontSize: 11, fontWeight: 700, color: meta.accent }}>{n.meta}</span>}
                        {n.meta && <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#CBD0E4" }} />}
                        <span style={{ fontSize: 11, color: "#9BA3C4" }}>{relativeTime(n.timestamp)}</span>
                      </div>
                      {n.action && (
                        <button
                          type="button"
                          className="notif-action"
                          disabled={isBusy}
                          // Stop the row's own click — pressing Try again should
                          // fix the problem in place, not navigate away from it.
                          onClick={(e) => {
                            e.stopPropagation()
                            void runAction(n)
                          }}
                          style={{
                            marginTop: 9,
                            padding: "6px 12px",
                            borderRadius: 8,
                            border: `1px solid ${meta.accent}33`,
                            background: meta.bg,
                            color: meta.accent,
                            fontSize: 11.5,
                            fontWeight: 700,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          {isBusy ? n.action.busyLabel : n.action.label}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Escalation banner (full-width, below header) — unchanged ───────────────
export function EscalationBannerStrip({
  escalations,
  onView,
  onDismiss,
}: {
  escalations: Notification[]
  onView: (id: string) => void
  onDismiss: (id: string) => void
}) {
  if (escalations.length === 0) return null
  return (
    <div className="w-full shrink-0">
      {escalations.map((n) => {
        const { dept, reason } = escalationParts(n)
        return (
          <div key={n.id} className="flex items-center gap-3 bg-red-600 text-white px-6 py-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <p className="flex-1 text-sm font-medium">
              ⚠️ New Escalation{dept ? ` — ${dept}` : ""}
              {reason ? `: ${reason}` : ""}
            </p>
            {n.related_id && (
              <Link
                href={`/sessions/${n.related_id}`}
                onClick={() => onView(n.id)}
                className="text-sm underline underline-offset-2 hover:no-underline shrink-0"
              >
                View
              </Link>
            )}
            <button
              onClick={() => onDismiss(n.id)}
              className="shrink-0 hover:opacity-75"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
