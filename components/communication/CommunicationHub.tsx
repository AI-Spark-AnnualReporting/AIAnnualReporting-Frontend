"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { formatDistanceToNow } from "date-fns"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/contexts/AuthContext"
import {
  communicationsApi,
  type ThreadlessReportType,
  type ThreadlessReport,
  type CommunicationMember,
  type ThreadSummary,
  type ThreadDetail,
  type ThreadMessage,
} from "@/lib/api/communications"

/* ══════════════════════════════════════════════════════════════════════
   Communication Hub — replicated from the Centriyon IR app for the Annual
   Report workspace (department / HOD / PM roles). Every report in one place;
   on each one, brief the team (Internal). External / Publish are static
   placeholders here — later parts. Wired to the live backend via
   communicationsApi (same host + shared JWT).
═══════════════════════════════════════════════════════════════════════ */

// ── Shared inline styles (self-contained — no global CSS dependency) ──────
const CARD: CSSProperties = {
  background: "#fff",
  border: "1px solid #E2E4F0",
  borderRadius: 16,
  boxShadow: "0 2px 12px rgba(64,64,200,.06)",
}
const BTN_PRIMARY: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "7px 14px",
  borderRadius: 10,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  border: "none",
  background: "#4040C8",
  color: "#fff",
  boxShadow: "0 4px 14px rgba(64,64,200,.3)",
  transition: ".15s",
}
const BTN_SECONDARY: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "7px 14px",
  borderRadius: 10,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  background: "#fff",
  color: "#5A6080",
  border: "1.5px solid #E2E4F0",
  transition: ".15s",
}
const BADGE_GRAY: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "3px 9px",
  borderRadius: 20,
  fontSize: 10,
  fontWeight: 700,
  background: "#E8EAF5",
  color: "#5A6080",
}
const INPUT: CSSProperties = {
  width: "100%",
  padding: "10px 13px",
  border: "1.5px solid #E2E4F0",
  borderRadius: 10,
  fontSize: 12,
  color: "#1A1D2E",
  fontFamily: "inherit",
  outline: "none",
  background: "#fff",
}
const OVERLAY: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(53,53,181,.7)",
  zIndex: 10001,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backdropFilter: "blur(5px)",
  padding: 16,
}
const MODAL: CSSProperties = {
  background: "#fff",
  borderRadius: 20,
  maxWidth: "96vw",
  boxShadow: "0 24px 80px rgba(0,0,0,.22)",
}
const SECTION_LABEL: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: "#9BA3C4",
  letterSpacing: ".7px",
  marginBottom: 10,
}

// Scoped focus/hover rules the inline styles above can't express.
const SCOPED_CSS = `
.chub-inp:focus { border-color:#4040C8; box-shadow:0 0 0 3px rgba(64,64,200,.1); }
.chub-inp::placeholder { color:#9BA3C4; }
.chub-chbtn:hover { border-color:#C9CDE4; background:#FAFBFF; }
`

function Spinner({ size = 34 }: { size?: number }) {
  return <Loader2 className="animate-spin" style={{ width: size, height: size, color: "#4040C8" }} />
}

// Normalized axios errors reject as { error, message, status, details }.
function statusOf(e: unknown): number | undefined {
  if (e && typeof e === "object" && "status" in e) {
    const s = (e as { status?: unknown }).status
    return typeof s === "number" ? s : undefined
  }
  return undefined
}

// ── Small formatting helpers ──────────────────────────────────────────────
type ReportKind = "report" | "board" | "esg"

// Backend sends report_type only (no icon). Map: ESG → green leaf, board →
// purple board, all financial types (quarterly/annual/agm/dividend/press) →
// purple chart.
function reportKind(reportType: string): ReportKind {
  if (reportType === "esg") return "esg"
  if (reportType === "board") return "board"
  return "report"
}

// "Aizaz Zulfiqar" → "Aizaz Z."; single name → unchanged.
function abbreviateName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length < 2) return parts[0] ?? ""
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

// ISO timestamp → "2 hours ago", "just now", etc.
function relativeTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return formatDistanceToNow(d, { addSuffix: true })
}

// "department_user" → "Department User"
function roleLabel(role: string): string {
  return role
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
}

function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

/* ── File-type icon tiles ──────────────────────────────────────────── */
const ICON_CHART = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M3 13.5l3.5-4 3 3L15 6.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 3v14h14" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity=".55" />
  </svg>
)
const ICON_BOARD = (
  <svg width="19" height="19" viewBox="0 0 20 20" fill="none">
    <rect x="4" y="3" width="12" height="14" rx="1.6" stroke="#fff" strokeWidth="1.6" />
  </svg>
)
const ICON_LEAF = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M16 4c0 6-3.5 10-9 10-1 0-2-.2-2-.2S5 6 16 4z" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M5 16c2.5-4 5-6 8.5-8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)

function FileTile({ kind }: { kind: ReportKind }) {
  const cfg =
    kind === "esg"
      ? { bg: "linear-gradient(150deg,#22C55E,#16A34A)", icon: ICON_LEAF }
      : kind === "board"
        ? { bg: "linear-gradient(150deg,#7C5CFF,#5B34D6)", icon: ICON_BOARD }
        : { bg: "linear-gradient(150deg,#5B5BF0,#4040C8)", icon: ICON_CHART }
  return (
    <div style={{ flexShrink: 0, textAlign: "center" }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 11,
          background: cfg.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 12px rgba(64,64,200,.22)",
        }}
      >
        {cfg.icon}
      </div>
      <div style={{ fontSize: 8.5, fontWeight: 800, color: "#9BA3C4", letterSpacing: ".6px", marginTop: 4 }}>PDF</div>
    </div>
  )
}

/* ── Channel action buttons (Internal / External / Publish) ────────── */
const ICON_LOCK = (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <rect x="3" y="6" width="8" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.4" />
    <path d="M4.7 6V4.6a2.3 2.3 0 0 1 4.6 0V6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)
const ICON_MAIL = (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <rect x="1.8" y="3" width="10.4" height="8" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
    <path d="M2.2 3.8L7 7.4l4.8-3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const ICON_PUBLISH = (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <path d="M7 9.5V2.5M4.3 5.2L7 2.4l2.7 2.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2.5 9.5v1.4a.9.9 0 0 0 .9.9h7.2a.9.9 0 0 0 .9-.9V9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)

function ChannelBtn({
  icon,
  label,
  count,
  tone,
  onClick,
}: {
  icon: ReactNode
  label: string
  count: number | null
  tone: "internal" | "external" | "publish"
  onClick?: () => void
}) {
  const color = tone === "internal" ? "#7C3AED" : tone === "external" ? "#16A34A" : "#0EA5C4"
  const bg = tone === "internal" ? "#F1ECFF" : tone === "external" ? "#E7F7EE" : "#E4F5FA"
  return (
    <button
      type="button"
      className="chub-chbtn"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 11px",
        borderRadius: 9,
        border: "1.5px solid #E5E7EF",
        background: "#fff",
        fontSize: 12,
        fontWeight: 600,
        color: "#4A5170",
        cursor: "pointer",
        transition: ".15s",
      }}
    >
      <span style={{ color, display: "inline-flex" }}>{icon}</span>
      {label}
      {count != null && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 18,
            height: 18,
            padding: "0 5px",
            borderRadius: 6,
            background: bg,
            color,
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function ThreadRow({
  thread,
  last,
  onOpen,
}: {
  thread: ThreadSummary
  last: boolean
  onOpen: (thread: ThreadSummary) => void
}) {
  const { report, owner, last_message, updated_at, unread_count, internal_count } = thread

  const ownerLabel = owner
    ? `${abbreviateName(owner.full_name)}${owner.is_you ? " (you)" : ""}`
    : "—"

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "16px 20px",
        borderBottom: last ? "none" : "1px solid #F0F1F8",
      }}
    >
      <FileTile kind={reportKind(report.report_type)} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#1A1D2E", letterSpacing: "-.1px" }}>
            {report.title}
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "2px 9px",
              borderRadius: 20,
              background: "rgba(245,158,11,.12)",
              color: "#B45309",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#F59E0B" }} />
            {report.status_label}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "#8890AE", marginTop: 3 }}>
          Owner: {ownerLabel} · {relativeTime(updated_at)}
        </div>
        <div style={{ fontSize: 12.5, color: "#5A6080", marginTop: 6, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {last_message ? (
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span style={{ fontWeight: 700, color: "#1A1D2E" }}>
                {last_message.is_you ? "You" : last_message.sender_full_name}:
              </span>{" "}
              {last_message.preview}
            </span>
          ) : (
            <span style={{ color: "#9BA3C4", fontStyle: "italic" }}>No messages yet.</span>
          )}
          {unread_count > 0 && (
            <span
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 8px",
                borderRadius: 20,
                background: "rgba(124,58,237,.12)",
                color: "#7C3AED",
                fontSize: 10.5,
                fontWeight: 700,
              }}
            >
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#7C3AED" }} />
              {unread_count} new
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <ChannelBtn icon={ICON_LOCK} label="Internal" count={internal_count} tone="internal" onClick={() => onOpen(thread)} />
        {/* External / Publish are static placeholders on this page (later parts). */}
        <ChannelBtn icon={ICON_MAIL} label="External" count={null} tone="external" />
        <ChannelBtn icon={ICON_PUBLISH} label="Publish" count={null} tone="publish" />
      </div>
    </div>
  )
}

/* ── Shared @mention composer ──────────────────────────────────────────────
   Controlled: the parent owns `message` + `mentions`. Typing "@" opens a
   client-side-filtered picker; selecting a member adds a removable chip and
   strips the "@query" from the text. The parent sends mentions.map(m => m.id).
─────────────────────────────────────────────────────────────────────────── */
function MentionComposer({
  members,
  currentUserId,
  message,
  onMessageChange,
  mentions,
  onMentionsChange,
  placeholder,
  minHeight = 92,
}: {
  members: CommunicationMember[]
  currentUserId?: string | null
  message: string
  onMessageChange: (value: string) => void
  mentions: CommunicationMember[]
  onMentionsChange: (next: CommunicationMember[]) => void
  placeholder?: string
  minHeight?: number
}) {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null)

  const matches = useMemo(() => {
    if (mentionQuery == null) return []
    const q = mentionQuery.toLowerCase()
    return members
      .filter((m) => m.user_id !== currentUserId) // hide self
      .filter((m) => !mentions.some((x) => x.id === m.id))
      .filter((m) => m.full_name.toLowerCase().includes(q))
      .slice(0, 6)
  }, [mentionQuery, members, currentUserId, mentions])

  const open = mentionQuery != null && matches.length > 0

  // Anchor the dropdown just below the textarea, matched to its width. Rendered
  // in a portal so it opens downward and is never clipped by the modal.
  useEffect(() => {
    if (!open) return
    const measure = () => {
      const el = taRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setAnchor({ left: r.left, top: r.bottom + 4, width: r.width })
    }
    measure()
    window.addEventListener("resize", measure)
    window.addEventListener("scroll", measure, true)
    return () => {
      window.removeEventListener("resize", measure)
      window.removeEventListener("scroll", measure, true)
    }
  }, [open, message, mentions.length])

  const handleChange = (value: string) => {
    onMessageChange(value)
    const m = value.match(/@([\p{L}\p{N}]*)$/u)
    setMentionQuery(m ? m[1] : null)
  }

  const add = (member: CommunicationMember) => {
    if (!mentions.some((x) => x.id === member.id)) onMentionsChange([...mentions, member])
    onMessageChange(message.replace(/@([\p{L}\p{N}]*)$/u, ""))
    setMentionQuery(null)
    taRef.current?.focus()
  }

  const remove = (id: string) => onMentionsChange(mentions.filter((m) => m.id !== id))

  return (
    <>
      {mentions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {mentions.map((m) => (
            <span
              key={m.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 6px 4px 10px",
                borderRadius: 20,
                background: "#F1ECFF",
                color: "#6D28D9",
                fontSize: 11.5,
                fontWeight: 700,
              }}
            >
              @{m.full_name}
              <button
                type="button"
                onClick={() => remove(m.id)}
                aria-label={`Remove ${m.full_name}`}
                style={{
                  display: "inline-flex",
                  border: "none",
                  background: "transparent",
                  color: "#8B5CF6",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      <textarea
        ref={taRef}
        className="chub-inp"
        value={message}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...INPUT, minHeight, resize: "vertical", lineHeight: 1.5 }}
      />

      {open &&
        anchor &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: anchor.left,
              top: anchor.top,
              width: anchor.width,
              background: "#fff",
              border: "1px solid #E2E4F0",
              borderRadius: 12,
              boxShadow: "0 12px 32px rgba(26,29,46,.14)",
              zIndex: 10002, // above the modal overlay (10001)
              overflow: "hidden",
              maxHeight: 232,
              overflowY: "auto",
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {matches.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => add(m)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  textAlign: "left",
                  padding: "9px 13px",
                  border: "none",
                  borderBottom: "1px solid #F4F5FB",
                  background: "#fff",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: "#EEEEFF",
                    color: "#4040C8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  {initials(m.full_name)}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: "#1A1D2E" }}>
                  {m.full_name}
                </span>
                {/* Fixed-width column so every role badge starts at the same x. */}
                <span style={{ flexShrink: 0, width: 128, display: "flex", justifyContent: "flex-start" }}>
                  <span style={BADGE_GRAY}>{roleLabel(m.role)}</span>
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}

function NewThreadModal({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [types, setTypes] = useState<ThreadlessReportType[]>([])
  const [reports, setReports] = useState<ThreadlessReport[]>([])
  const [members, setMembers] = useState<CommunicationMember[]>([])

  const [typeFilter, setTypeFilter] = useState<string>(ALL_FILTER)
  const [reportId, setReportId] = useState<string | null>(null)

  const [message, setMessage] = useState("")
  const [mentions, setMentions] = useState<CommunicationMember[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    // Mount-only load — state already initializes to loading:true / error:null,
    // so we don't setState synchronously at the top of the effect.
    let cancelled = false
    Promise.all([communicationsApi.threadlessReports(), communicationsApi.members()])
      .then(([reportsRes, membersRes]) => {
        if (cancelled) return
        setTypes(reportsRes.types)
        setReports(reportsRes.reports)
        setMembers(membersRes.members)
      })
      .catch((e) => {
        if (cancelled) return
        if (statusOf(e) === 401) return // interceptor already redirected
        setLoadError("Could not load reports. Please try again.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const refreshReports = () => {
    setReportId(null)
    communicationsApi
      .threadlessReports()
      .then((res) => {
        setTypes(res.types)
        setReports(res.reports)
      })
      .catch(() => {})
  }

  const refreshMembers = () => {
    communicationsApi
      .members()
      .then((res) => setMembers(res.members))
      .catch(() => {})
  }

  // Pills stay constant across filters (from `types`); only the list narrows.
  const visibleReports = useMemo(
    () =>
      typeFilter === ALL_FILTER ? reports : reports.filter((r) => r.report_type === typeFilter),
    [reports, typeFilter],
  )

  const labelForCode = (code: string) => types.find((t) => t.code === code)?.label ?? code

  const messageEmpty = message.trim().length === 0
  // A thread must be addressed to at least one participant.
  const needsRecipient = !messageEmpty && mentions.length === 0
  const canSubmit = !!reportId && !messageEmpty && mentions.length > 0 && !submitting

  const submit = async () => {
    if (!reportId || messageEmpty) return
    if (mentions.length === 0) {
      setFormError("Add at least one participant with @ before starting.")
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      await communicationsApi.startThread({
        report_id: reportId,
        message: message.trim(),
        // Members' UUID `id`s — NOT their usr_ `user_id`. Backend dedupes +
        // drops any self-mention, so no client-side cleanup needed.
        mentioned_user_ids: mentions.map((m) => m.id),
      })
      toast.success("Thread started", { description: "Your team has been briefed." })
      onCreated?.()
      onClose()
    } catch (e) {
      const s = statusOf(e)
      if (s === undefined) {
        setFormError("Something went wrong. Please try again.")
        setSubmitting(false)
        return
      }
      switch (s) {
        case 422:
          setFormError("Message can't be empty")
          break
        case 404:
          toast.error("That report is no longer available")
          refreshReports()
          break
        case 409:
          toast.error("A conversation already exists for this report")
          setReports((prev) => prev.filter((r) => r.id !== reportId))
          setReportId(null)
          break
        case 403:
          toast.error("One of the mentioned people is no longer available")
          refreshMembers()
          break
        case 401:
          break // interceptor handled the redirect
        default:
          setFormError("Something went wrong. Please try again.")
      }
      setSubmitting(false)
    }
  }

  return (
    <div style={OVERLAY} onClick={onClose}>
      <div style={{ ...MODAL, width: 620, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
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
              <path d="M7 2.5v9M2.5 7h9" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: "#9BA3C4", letterSpacing: ".9px" }}>
              NEW · START A THREAD
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#1A1D2E", marginTop: 2, letterSpacing: "-.2px" }}>
              Start a communication
            </div>
            <div style={{ fontSize: 12.5, color: "#8890AE", marginTop: 3 }}>
              Pick a report type, choose a report, and brief the team
            </div>
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

        <div style={{ padding: "0 22px 4px" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "48px 0" }}>
              <Spinner />
              <div style={{ fontSize: 12, color: "#9BA3C4", fontWeight: 600 }}>Loading reports…</div>
            </div>
          ) : loadError ? (
            <div style={{ padding: "40px 0", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "#DC2626", marginBottom: 12 }}>{loadError}</div>
              <button type="button" style={BTN_SECONDARY} onClick={refreshReports}>
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* Report type pills — always from `types`; "All" clears the filter. */}
              <div style={SECTION_LABEL}>REPORT TYPE</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 9, marginBottom: 20 }}>
                {[{ code: ALL_FILTER, label: "All", count: null as number | null }, ...types].map((t) => {
                  const active = t.code === typeFilter
                  return (
                    <button
                      key={t.code}
                      type="button"
                      onClick={() => {
                        setTypeFilter(t.code)
                        setReportId(null)
                      }}
                      style={{
                        padding: "7px 15px",
                        borderRadius: 20,
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        transition: ".15s",
                        border: active ? "1.5px solid #4040C8" : "1.5px solid #E5E7EF",
                        background: active ? "#4040C8" : "#fff",
                        color: active ? "#fff" : "#5A6080",
                        boxShadow: active ? "0 4px 12px rgba(64,64,200,.25)" : "none",
                      }}
                    >
                      {t.label}
                      {t.count != null && ` · ${t.count}`}
                    </button>
                  )
                })}
              </div>

              {/* Reports without a thread yet */}
              <div style={SECTION_LABEL}>REPORTS WITHOUT A THREAD YET</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                {visibleReports.length === 0 ? (
                  <div
                    style={{
                      padding: "22px 16px",
                      border: "1px dashed #E5E7EF",
                      borderRadius: 12,
                      textAlign: "center",
                      fontSize: 12.5,
                      color: "#9BA3C4",
                    }}
                  >
                    No reports without a thread yet.
                  </div>
                ) : (
                  visibleReports.map((r) => {
                    const selected = r.id === reportId
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setReportId(r.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 13,
                          textAlign: "left",
                          padding: "14px 16px",
                          borderRadius: 12,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          transition: ".15s",
                          border: selected ? "1.5px solid #4040C8" : "1.5px solid #E5E7EF",
                          background: selected ? "#F5F4FF" : "#fff",
                        }}
                      >
                        <span
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: "50%",
                            flexShrink: 0,
                            border: selected ? "5px solid #4040C8" : "1.6px solid #CBD0E4",
                            transition: ".15s",
                          }}
                        />
                        <span style={{ minWidth: 0, fontSize: 13.5, fontWeight: 700, color: "#1A1D2E" }}>
                          {labelForCode(r.report_type)} · {r.period}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>

              {/* First message + @mention picker */}
              <div style={SECTION_LABEL}>START THE THREAD WITH A MESSAGE</div>

              <MentionComposer
                members={members}
                currentUserId={user?.user_id}
                message={message}
                onMessageChange={(v) => {
                  setMessage(v)
                  if (formError) setFormError(null)
                }}
                mentions={mentions}
                onMentionsChange={setMentions}
                placeholder="Write the first message to the team...  (type @ to mention)"
              />

              {(formError || needsRecipient) && (
                <div
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    marginTop: 7,
                    color: formError ? "#DC2626" : "#9BA3C4",
                  }}
                >
                  {formError ?? "Add at least one participant with @ to start."}
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
            {submitting ? "Starting…" : "Start thread"}
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageRow({ message }: { message: ThreadMessage }) {
  const { sender, body, created_at } = message
  return (
    <div style={{ display: "flex", gap: 12, padding: "14px 0", borderTop: "1px solid #F4F5FB" }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          flexShrink: 0,
          background: sender.is_you ? "linear-gradient(150deg,#5B5BF0,#4040C8)" : "#EEEEFF",
          color: sender.is_you ? "#fff" : "#4040C8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 800,
        }}
      >
        {initials(sender.full_name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1A1D2E" }}>
            {sender.full_name}
            {/* Append " (you)" unless the backend already named the sender "You". */}
            {sender.is_you && sender.full_name.trim().toLowerCase() !== "you" && " (you)"}
          </span>
          <span style={BADGE_GRAY}>{roleLabel(sender.role)}</span>
          <span style={{ fontSize: 11, color: "#9BA3C4" }}>{relativeTime(created_at)}</span>
        </div>
        <div style={{ fontSize: 13, color: "#3A4066", marginTop: 4, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {body}
        </div>
      </div>
    </div>
  )
}

function ThreadViewModal({ threadId, onClose }: { threadId: string; onClose: () => void }) {
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [thread, setThread] = useState<ThreadDetail | null>(null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [members, setMembers] = useState<CommunicationMember[]>([])

  const [message, setMessage] = useState("")
  const [mentions, setMentions] = useState<CommunicationMember[]>([])
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  // On open → load thread + members in parallel, and fire read (idempotent).
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      communicationsApi.getThread(threadId),
      // A members failure shouldn't block the thread from rendering.
      communicationsApi.members().catch(() => ({ members: [] as CommunicationMember[] })),
    ])
      .then(([detail, membersRes]) => {
        if (cancelled) return
        setThread(detail.thread)
        setMessages(detail.messages)
        setMembers(membersRes.members)
      })
      .catch((e) => {
        if (cancelled) return
        const s = statusOf(e)
        if (s === 401) return
        if (s === 404) {
          toast.error("That conversation is no longer available")
          onClose()
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
      const s = statusOf(e)
      if (s === undefined) {
        setSendError("Something went wrong. Please try again.")
        setSending(false)
        return
      }
      switch (s) {
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
  const ownerLabel = thread
    ? thread.owner
      ? `${abbreviateName(thread.owner.full_name)}${thread.owner.is_you ? " (you)" : ""}`
      : "—"
    : ""

  return (
    <div style={OVERLAY} onClick={onClose}>
      <div
        style={{ ...MODAL, width: 640, maxHeight: "min(86vh, 720px)", display: "flex", flexDirection: "column", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "20px 22px 14px", borderBottom: "1px solid #ECEEF8" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "2px 9px",
                borderRadius: 20,
                background: "#F1ECFF",
                color: "#7C3AED",
                fontSize: 9.5,
                fontWeight: 800,
                letterSpacing: ".6px",
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#7C3AED" }} />
              INTERNAL
            </span>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#1A1D2E", marginTop: 7, letterSpacing: "-.2px" }}>
              {report ? report.title : "Conversation"}
            </div>
            <div style={{ fontSize: 12, color: "#8890AE", marginTop: 3 }}>
              {thread ? (
                <>
                  Owner: {ownerLabel} · {relativeTime(thread.updated_at)}
                </>
              ) : (
                " "
              )}
            </div>
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

        {/* Message list — show ~5 messages, then scroll (maxHeight ≈ 5 rows). */}
        <div style={{ flex: 1, maxHeight: 400, overflowY: "auto", padding: "4px 22px 12px" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "56px 0" }}>
              <Spinner />
              <div style={{ fontSize: 12, color: "#9BA3C4", fontWeight: 600 }}>Loading conversation…</div>
            </div>
          ) : error ? (
            <div style={{ padding: "48px 0", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "#DC2626" }}>{error}</div>
            </div>
          ) : messages.length === 0 ? (
            <div style={{ padding: "48px 0", textAlign: "center", fontSize: 13, color: "#9BA3C4" }}>
              No messages yet.
            </div>
          ) : (
            messages.map((m) => <MessageRow key={m.id} message={m} />)
          )}
        </div>

        {/* Reply composer */}
        {!loading && !error && (
          <div style={{ borderTop: "1px solid #ECEEF8", padding: "14px 22px 18px" }}>
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
        )}
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      <span style={{ fontSize: 12, color: "#5A6080" }}>{label}</span>
    </span>
  )
}

// Sentinel for the "All" pill — no ?type filter, show every threadless report.
const ALL_FILTER = "__all__"

export function CommunicationHub() {
  const [tab, setTab] = useState<"communication" | "history">("communication")
  const [showNew, setShowNew] = useState(false)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)

  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchThreads = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Rows arrive pre-sorted (updated_at desc) — render in the order received.
      const res = await communicationsApi.listThreads()
      setThreads(res.threads)
    } catch (e) {
      if (statusOf(e) === 401) return // interceptor already redirected
      setError("Could not load conversations. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchThreads()
  }, [fetchThreads])

  // Clicking a thread's Internal button opens the thread-view modal and
  // optimistically zeros the row's "N new" badge. The modal fires POST /read.
  const openThread = useCallback((thread: ThreadSummary) => {
    setThreads((prev) =>
      prev.map((t) => (t.thread_id === thread.thread_id ? { ...t, unread_count: 0 } : t)),
    )
    setActiveThreadId(thread.thread_id)
  }, [])

  // A reply bumps updated_at (reorders the list) and read clears counts — so
  // refresh the list whenever the modal closes.
  const closeThread = useCallback(() => {
    setActiveThreadId(null)
    void fetchThreads()
  }, [fetchThreads])

  const TAB: CSSProperties = {
    padding: "6px 16px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    color: "#5A6080",
    border: "none",
    background: "transparent",
    fontFamily: "inherit",
    transition: ".15s",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  }
  const TAB_ACTIVE: CSSProperties = {
    background: "#4040C8",
    color: "#fff",
    boxShadow: "0 4px 12px rgba(64,64,200,.25)",
    fontWeight: 700,
  }

  return (
    <div>
      <style>{SCOPED_CSS}</style>
      {activeThreadId && <ThreadViewModal threadId={activeThreadId} onClose={closeThread} />}
      {showNew && <NewThreadModal onClose={() => setShowNew(false)} onCreated={() => void fetchThreads()} />}

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 25, fontWeight: 800, color: "#1A1D2E", letterSpacing: "-.4px" }}>Communication Hub</h1>
          <p style={{ fontSize: 13, color: "#7A8199", marginTop: 6, maxWidth: 620 }}>
            Every report in one place. On each one, brief the team, email investors, or publish it.
          </p>
        </div>
        <button
          type="button"
          style={{ ...BTN_PRIMARY, flexShrink: 0, gap: 7 }}
          onClick={() => setShowNew(true)}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          New report
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          background: "#F2F3FA",
          borderRadius: 22,
          padding: 4,
          marginBottom: 14,
          width: "fit-content",
          border: "1px solid #E2E4F0",
        }}
      >
        <button style={{ ...TAB, ...(tab === "communication" ? TAB_ACTIVE : {}) }} onClick={() => setTab("communication")}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 3.2A1.2 1.2 0 0 1 3.2 2h7.6A1.2 1.2 0 0 1 12 3.2v5A1.2 1.2 0 0 1 10.8 9.4H5l-2.6 2.1V3.2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
          Communication
        </button>
        <button style={{ ...TAB, ...(tab === "history" ? TAB_ACTIVE : {}) }} onClick={() => setTab("history")}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2.5 7a4.5 4.5 0 1 0 1.4-3.3M2.5 2.2v2.4h2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7 4.7V7l1.6 1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          History
        </button>
      </div>

      {tab === "communication" ? (
        <>
          {/* Legend */}
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#5A6080" }}>Each report:</span>
            <LegendDot color="#7C3AED" label="Internal — brief & sign-off" />
            <LegendDot color="#16A34A" label="External — email investors" />
            <LegendDot color="#0EA5C4" label="Publish — to your platform" />
          </div>

          {/* Report / thread list */}
          {loading ? (
            <div style={{ ...CARD, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "56px 0" }}>
              <Spinner size={36} />
              <div style={{ fontSize: 12, color: "#9BA3C4", fontWeight: 600 }}>Loading conversations…</div>
            </div>
          ) : error ? (
            <div style={{ ...CARD, padding: "48px 0", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "#DC2626", marginBottom: 12 }}>{error}</div>
              <button type="button" style={BTN_SECONDARY} onClick={() => void fetchThreads()}>
                Retry
              </button>
            </div>
          ) : threads.length === 0 ? (
            <div style={{ ...CARD, padding: 48, textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "#9BA3C4" }}>
                No conversations yet. Start one with <strong>New report</strong>.
              </div>
            </div>
          ) : (
            <div style={{ ...CARD, overflow: "hidden" }}>
              {threads.map((t, i) => (
                <ThreadRow key={t.thread_id} thread={t} last={i === threads.length - 1} onOpen={openThread} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ ...CARD, padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#9BA3C4" }}>No communication history yet.</div>
        </div>
      )}
    </div>
  )
}
