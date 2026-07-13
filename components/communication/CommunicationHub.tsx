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
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/contexts/AuthContext"
import { centriyonBaseUrl } from "@/lib/centriyon"
import {
  communicationsApi,
  type ThreadlessReportType,
  type ThreadlessReport,
  type CommunicationMember,
  type ThreadSummary,
  type ThreadDetail,
  type ThreadMessage,
  type ThreadReport,
  type CentrionCompany,
  type EmailAudience,
  type EmailSend,
  type EmailSendStatus,
  type EmailSendSavePayload,
  type EmailSendsResponse,
  type DraftListItem,
} from "@/lib/api/communications"
import {
  useEmailSends,
  useSendRecipients,
  usePublications,
  exportRecipientsCsv,
  useDrafts,
  useSaveSend,
} from "@/hooks/useCommunicationHistory"

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
.chub-ext-body p, .chub-ext-preview-body p { margin:0 0 12px; }
.chub-ext-body p:last-child, .chub-ext-preview-body p:last-child { margin-bottom:0; }
.chub-ext-body a, .chub-ext-preview-body a { color:#4040C8; text-decoration:underline; cursor:pointer; }
.chub-ext-body ul, .chub-ext-preview-body ul { margin:0 0 12px; padding-left:22px; list-style:disc outside; }
.chub-ext-body li, .chub-ext-preview-body li { list-style:disc outside; display:list-item; }
.chub-ext-body ol, .chub-ext-preview-body ol { margin:0 0 12px; padding-left:22px; list-style:decimal outside; }
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
  onExternal,
  onPublish,
}: {
  thread: ThreadSummary
  last: boolean
  onOpen: (thread: ThreadSummary) => void
  onExternal: (thread: ThreadSummary) => void
  onPublish: () => void
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
        <ChannelBtn icon={ICON_MAIL} label="External" count={null} tone="external" onClick={() => onExternal(thread)} />
        <ChannelBtn icon={ICON_PUBLISH} label="Publish" count={null} tone="publish" onClick={onPublish} />
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

/* ══════════════════════════════════════════════════════════════════════
   External email modal — opens from a row's External button. A static
   placeholder (later parts wire it to the backend): compose the investor
   email on the left, preview what the investor receives on the right.
═══════════════════════════════════════════════════════════════════════ */

// Pill toggle used by the delivery/publish options + the footer Schedule
// switch. `color` sets the "on" track (purple for External, teal for Publish).
function Toggle({ on, onChange, color = "#6D45F5" }: { on: boolean; onChange: (next: boolean) => void; color?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={{
        flexShrink: 0,
        width: 40,
        height: 22,
        borderRadius: 20,
        border: "none",
        cursor: "pointer",
        padding: 0,
        position: "relative",
        background: on ? color : "#D5D9E6",
        transition: ".18s",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 20 : 2,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,.25)",
          transition: ".18s",
        }}
      />
    </button>
  )
}

// A green recipient chip: "Institutional investors  340  ×"
function RecipientChip({ label, count, onRemove }: { label: string; count?: number; onRemove?: () => void }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 9px 6px 12px",
        borderRadius: 20,
        background: "#E7F7EE",
        color: "#15803D",
        fontSize: 12.5,
        fontWeight: 600,
      }}
    >
      {label}
      {count != null && <span style={{ fontSize: 11.5, fontWeight: 800, color: "#16A34A", opacity: 0.85 }}>{count}</span>}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        style={{ display: "inline-flex", border: "none", background: "transparent", color: "#4BAF79", cursor: "pointer", padding: 0 }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </span>
  )
}

/* ── Investor-email helpers (shared by the External modal) ──────────────────
   Company name/city/currency come from the live company profile; the sender
   address is derived from the company's website host (fallback: a name slug).
   All best-effort — the modal still works if the fetch fails. */
function companyDomain(company: CentrionCompany | null, fallbackName: string): string {
  const raw = company?.website_url?.trim()
  if (raw) {
    try {
      const host = new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.replace(/^www\./, "")
      if (host) return host
    } catch {
      /* fall through to the slug */
    }
  }
  const slug = fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, "")
  return `${slug || "company"}.com`
}

// ISO → "YYYY-MM-DDTHH:mm" for a datetime-local input (local time).
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// contentEditable and the preview swallow anchor navigation, so intercept a
// click on a link and open it in a new tab. Used by both the editor + preview.
function openAnchorFromEvent(e: React.MouseEvent) {
  const anchor = (e.target as HTMLElement).closest("a")
  const href = anchor?.getAttribute("href")
  if (href) {
    e.preventDefault()
    window.open(href, "_blank", "noopener,noreferrer")
  }
}

// A tiny WYSIWYG editor: toolbar (B/I/U/link/list) + a contentEditable box.
// Seeds its HTML once from `initialHtml` (uncontrolled inner HTML so the caret
// never jumps), and reports every edit via onChange so the preview stays live.
function RichTextEditor({ initialHtml, onChange }: { initialHtml: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initialHtml
    // Seed once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const emit = () => onChange(ref.current?.innerHTML ?? "")
  const exec = (command: string, value?: string) => {
    ref.current?.focus()
    document.execCommand(command, false, value)
    emit()
  }

  const TB_BTN: CSSProperties = {
    width: 26,
    height: 26,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    color: "#5A6080",
    cursor: "pointer",
    border: "none",
    background: "transparent",
    fontFamily: "inherit",
  }
  const hold = (e: React.MouseEvent) => e.preventDefault()

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "10px 0", borderTop: "1px solid #F0F1F8", borderBottom: "1px solid #F0F1F8" }}>
        <button type="button" onMouseDown={hold} onClick={() => exec("bold")} style={{ ...TB_BTN, fontWeight: 800, fontSize: 14 }}>B</button>
        <button type="button" onMouseDown={hold} onClick={() => exec("italic")} style={{ ...TB_BTN, fontStyle: "italic", fontSize: 14, fontFamily: "Georgia, serif" }}>I</button>
        <button type="button" onMouseDown={hold} onClick={() => exec("underline")} style={{ ...TB_BTN, textDecoration: "underline", fontSize: 14 }}>U</button>
        <button
          type="button"
          onMouseDown={hold}
          onClick={() => {
            const url = window.prompt("Link URL")
            if (url) {
              const trimmed = url.trim()
              // Bare hosts ("example.com") need a scheme or the browser treats
              // them as relative and the link won't open.
              const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
              exec("createLink", href)
            }
          }}
          style={TB_BTN}
          aria-label="Insert link"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-1 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M9.5 6.5a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l1-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" onMouseDown={hold} onClick={() => exec("insertUnorderedList")} style={TB_BTN} aria-label="Bulleted list">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M6 4.5h7M6 8h7M6 11.5h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="3" cy="4.5" r="1" fill="currentColor" />
            <circle cx="3" cy="8" r="1" fill="currentColor" />
            <circle cx="3" cy="11.5" r="1" fill="currentColor" />
          </svg>
        </button>
      </div>

      {/* Editable body */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onClick={openAnchorFromEvent}
        className="chub-ext-body"
        style={{ fontSize: 13.5, color: "#3A4066", lineHeight: 1.7, padding: "16px 2px 4px", minHeight: 120, outline: "none" }}
      />
    </>
  )
}

// A delivery-option row: icon · title/subtitle · toggle.
function DeliveryRow({
  icon,
  title,
  subtitle,
  on,
  onChange,
  accent,
}: {
  icon: ReactNode
  title: string
  subtitle: string
  on: boolean
  onChange: (next: boolean) => void
  accent?: string
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 0", borderBottom: "1px solid #F0F1F8" }}>
      <span
        style={{
          flexShrink: 0,
          width: 30,
          height: 30,
          borderRadius: 9,
          background: "#F3F4FA",
          color: "#7A8199",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1D2E" }}>{title}</div>
        <div style={{ fontSize: 11.5, color: "#8890AE", marginTop: 1 }}>{subtitle}</div>
      </div>
      <Toggle on={on} onChange={onChange} color={accent} />
    </div>
  )
}

// Delivery-option icons.
const ICON_EYE = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M1.5 8S3.8 3.8 8 3.8 14.5 8 14.5 8 12.2 12.2 8 12.2 1.5 8 1.5 8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    <circle cx="8" cy="8" r="1.9" stroke="currentColor" strokeWidth="1.3" />
  </svg>
)
const ICON_GRID = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="2.5" y="2.5" width="4.2" height="4.2" rx="1" stroke="currentColor" strokeWidth="1.3" />
    <rect x="9.3" y="2.5" width="4.2" height="4.2" rx="1" stroke="currentColor" strokeWidth="1.3" />
    <rect x="2.5" y="9.3" width="4.2" height="4.2" rx="1" stroke="currentColor" strokeWidth="1.3" />
    <rect x="9.3" y="9.3" width="4.2" height="4.2" rx="1" stroke="currentColor" strokeWidth="1.3" />
  </svg>
)
const ICON_SHIELD = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 2l4.5 1.8v3.4c0 3-2 5-4.5 6-2.5-1-4.5-3-4.5-6V3.8L8 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
)
const ICON_WATERMARK = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="2.8" y="2.8" width="10.4" height="10.4" rx="2" stroke="currentColor" strokeWidth="1.3" />
    <path d="M5.5 10.5l5-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
)

// Delivery options (track/post/sign-in/watermark) are hidden for now.
const SHOW_DELIVERY_OPTIONS = false

function ExternalEmailModal({
  report,
  draftId,
  onClose,
  onSaved,
}: {
  report: ThreadReport | null
  draftId?: string
  onClose: () => void
  onSaved?: () => void
}) {
  const saveSend = useSaveSend()

  // The row id once created/reopened — subsequent saves PATCH this id.
  const [sendId, setSendId] = useState<string | null>(draftId ?? null)
  const [prefillLoading, setPrefillLoading] = useState(!!draftId)

  // The attached report — from the opening thread, or loaded from the draft.
  const [attachedReport, setAttachedReport] = useState<{ id: string; title: string } | null>(
    report ? { id: report.id, title: report.title } : null,
  )
  const [attached, setAttached] = useState(!!report)
  // These reports live on the Centriyon app, so preview opens them there.
  const openReport = () => {
    if (!attachedReport) return
    const base = centriyonBaseUrl()
    if (base) window.open(`${base}/reports/${attachedReport.id}`, "_blank", "noopener,noreferrer")
  }

  const [trackOpens, setTrackOpens] = useState(true)
  const [postPortal, setPostPortal] = useState(true)
  const [requireSignIn, setRequireSignIn] = useState(false)
  const [watermark, setWatermark] = useState(false)
  const [schedule, setSchedule] = useState(false)
  const [scheduledAt, setScheduledAt] = useState("") // datetime-local value

  // Company profile (from the shared Centrion backend) — enriches the preview.
  const [company, setCompany] = useState<CentrionCompany | null>(null)
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const c = await communicationsApi.getMyCompany()
        if (!cancelled) setCompany(c)
      } catch {
        // leave company null; fall back to a generic name
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const initialCompanyName = "Your company"
  const companyName = company?.name ?? initialCompanyName
  const city = company?.headquarter_city ?? null
  const senderEmail = `investor.relations@${companyDomain(company, companyName)}`

  // Recipients — full ComposeRecipient rows so drafts round-trip org/contact/email.
  const [recipients, setRecipients] = useState<
    { id: string; name: string; org?: string | null; contact?: string | null; email?: string | null }[]
  >([])
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState("")
  const addRecipient = () => {
    const value = draft.trim()
    if (!value) {
      setAdding(false)
      return
    }
    setRecipients((prev) => [...prev, { id: `r-${prev.length}-${value}`, name: value, email: value.includes("@") ? value : null }])
    setDraft("")
  }
  const removeRecipient = (id: string) => setRecipients((prev) => prev.filter((r) => r.id !== id))

  // Subject + body — default from report; prefilled from a draft.
  const [subject, setSubject] = useState(report ? `${initialCompanyName} ${report.title} — Investor Highlights` : "")
  const [bodyHtml, setBodyHtml] = useState(
    report
      ? `<p>Dear Investor,</p>` +
          `<p>We are pleased to share ${initialCompanyName}'s latest results in ${report.title}. ` +
          `The full results deck is attached, including segment detail and the outlook.</p>` +
          `<p>Kind regards,<br>${initialCompanyName} Investor Relations</p>`
      : "",
  )
  // RichTextEditor seeds once on mount; bump to re-seed after a draft loads.
  const [editorKey, setEditorKey] = useState(0)
  const [formError, setFormError] = useState<string | null>(null)

  // Reopen a draft → prefill the editor. setState lands after the await.
  useEffect(() => {
    if (!draftId) return
    let cancelled = false
    const run = async () => {
      try {
        const d = await communicationsApi.getEmailSend(draftId)
        if (cancelled) return
        setSubject(d.subject ?? "")
        setBodyHtml(d.body ?? "")
        setEditorKey((k) => k + 1)
        setAttachedReport(d.report ? { id: d.report.id, title: d.report.title } : null)
        setAttached(!!d.report)
        setRecipients(
          d.recipients.map((r, i) => ({ id: `r-${i}`, name: r.name, org: r.org, contact: r.contact, email: r.email })),
        )
        if (d.status === "scheduled" && d.scheduled_at) {
          setSchedule(true)
          setScheduledAt(toDatetimeLocal(d.scheduled_at))
        }
      } catch (e) {
        if (cancelled) return
        if (statusOf(e) === 401) return
        toast.error("That draft is no longer available")
        onClose()
      } finally {
        if (!cancelled) setPrefillLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId])

  const attachmentName = `${(attachedReport?.title ?? "Report").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "Report"}.pdf`
  const recipientsLine = recipients.map((r) => r.email ?? r.name).join(", ")

  const subjectEmpty = subject.trim().length === 0
  const scheduleMissing = schedule && !scheduledAt
  const saving = saveSend.isPending

  const save = async (status: EmailSendStatus) => {
    if (subjectEmpty || saving || prefillLoading) return
    if (status === "scheduled" && !scheduledAt) {
      setFormError("Pick a date and time to schedule.")
      return
    }
    setFormError(null)
    const payload: EmailSendSavePayload = {
      subject: subject.trim(),
      audience_type: "external",
      audience_label: "Investors",
      body: bodyHtml,
      report_id: attached && attachedReport ? attachedReport.id : null,
      status,
      scheduled_at: status === "scheduled" ? new Date(scheduledAt).toISOString() : null,
      recipients: recipients.map((r) => ({ name: r.name, org: r.org, contact: r.contact, email: r.email })),
    }
    try {
      const send = await saveSend.mutateAsync({ id: sendId ?? undefined, payload })
      if (!sendId) setSendId(send.id)
      onSaved?.()
      if (status === "draft") {
        toast.success("Draft saved")
      } else {
        toast.success(status === "scheduled" ? "Email scheduled" : "Email sent")
        onClose()
      }
    } catch (e) {
      const s = statusOf(e)
      if (s === 422) {
        setFormError("Please check the subject and schedule time.")
      } else if (s === 409) {
        toast.error("This email was already sent")
        onSaved?.()
        onClose()
      } else if (s === 404) {
        toast.error("That draft is no longer available")
        onSaved?.()
        onClose()
      } else if (s !== 401) {
        setFormError("Something went wrong. Please try again.")
      }
    }
  }

  return (
    <div style={OVERLAY} onClick={onClose}>
      <div
        style={{ ...MODAL, width: 1140, display: "flex", flexDirection: "column", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "20px 24px 16px" }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "linear-gradient(150deg,#22C55E,#16A34A)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 4px 12px rgba(22,163,74,.28)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="2.6" y="4.4" width="14.8" height="11.2" rx="2" stroke="#fff" strokeWidth="1.5" />
              <path d="M3.2 5.4L10 10.4l6.8-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: "#9BA3C4", letterSpacing: ".9px" }}>
              EXTERNAL · EMAIL INVESTORS
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#1A1D2E", marginTop: 2, letterSpacing: "-.2px" }}>
              {attachedReport ? `Emailing: ${attachedReport.title}` : subject || "Investor email"}
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

        {/* Two columns */}
        <div style={{ display: "flex", flex: 1, minHeight: 0, borderTop: "1px solid #ECEEF8" }}>
          {/* ── Left: compose ─────────────────────────────────────────── */}
          <div style={{ flex: "1 1 0", minWidth: 0, padding: "20px 24px", overflowY: "auto", maxHeight: "min(64vh, 560px)" }}>
            <div style={SECTION_LABEL}>WRITE</div>

            {/* To */}
            <div style={{ display: "flex", gap: 20, alignItems: "flex-start", paddingBottom: 16 }}>
              <span style={{ fontSize: 12.5, color: "#8890AE", fontWeight: 600, paddingTop: 7, width: 48, flexShrink: 0 }}>To</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, flex: 1 }}>
                {recipients.map((r) => (
                  <RecipientChip key={r.id} label={r.email ?? r.name} onRemove={() => removeRecipient(r.id)} />
                ))}
                {adding ? (
                  <input
                    className="chub-inp"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        addRecipient()
                      } else if (e.key === "Escape") {
                        setDraft("")
                        setAdding(false)
                      }
                    }}
                    onBlur={addRecipient}
                    placeholder="name@investor.com"
                    style={{ ...INPUT, width: 200, padding: "6px 12px", fontSize: 12.5 }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "6px 12px",
                      borderRadius: 20,
                      border: "none",
                      background: "transparent",
                      color: "#16A34A",
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    + Add recipients
                  </button>
                )}
              </div>
            </div>

            {/* Subject */}
            <div style={{ display: "flex", gap: 20, alignItems: "flex-start", padding: "16px 0", borderTop: "1px solid #F0F1F8" }}>
              <span style={{ fontSize: 12.5, color: "#8890AE", fontWeight: 600, paddingTop: 10, width: 48, flexShrink: 0 }}>Subject</span>
              <input
                className="chub-inp"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                style={{ ...INPUT, flex: 1, fontSize: 14, fontWeight: 700, color: "#1A1D2E" }}
              />
            </div>

            {/* Body — WYSIWYG editor; `editorKey` re-seeds it when a draft loads. */}
            <RichTextEditor key={editorKey} initialHtml={bodyHtml} onChange={setBodyHtml} />

            {/* Attached report */}
            <div style={{ ...SECTION_LABEL, marginTop: 24 }}>ATTACHED REPORT</div>
            {attached ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  borderRadius: 12,
                  background: "#FBFBFE",
                  border: "1px solid #EEEFF6",
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    background: "#FEE9E9",
                    color: "#DC2626",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 8.5,
                    fontWeight: 800,
                    letterSpacing: ".3px",
                  }}
                >
                  PDF
                </span>
                <button
                  type="button"
                  onClick={openReport}
                  style={{ flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "transparent", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1D2E" }}>{attachmentName}</div>
                  <div style={{ fontSize: 11.5, color: "#8890AE", marginTop: 1 }}>Attached automatically · Click to preview</div>
                </button>
                <button
                  type="button"
                  onClick={() => setAttached(false)}
                  aria-label="Remove attached report"
                  style={{ flexShrink: 0, color: "#9BA3C4", cursor: "pointer", display: "inline-flex", border: "none", background: "transparent", padding: 0 }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ) : attachedReport ? (
              <button
                type="button"
                onClick={() => setAttached(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "11px 16px",
                  borderRadius: 12,
                  border: "1px dashed #D5D9E6",
                  background: "#fff",
                  color: "#16A34A",
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
                Attach report
              </button>
            ) : (
              <div style={{ fontSize: 12.5, color: "#9BA3C4", padding: "11px 0" }}>No report attached.</div>
            )}

            {/* Delivery options — hidden for now */}
            {SHOW_DELIVERY_OPTIONS && (
              <>
                <div style={{ ...SECTION_LABEL, marginTop: 24, marginBottom: 4 }}>DELIVERY OPTIONS</div>
                <DeliveryRow icon={ICON_EYE} title="Track opens & downloads" subtitle="See who engaged, per recipient" on={trackOpens} onChange={setTrackOpens} />
                <DeliveryRow icon={ICON_GRID} title="Also post to investor portal" subtitle="Publish alongside the email" on={postPortal} onChange={setPostPortal} />
                <DeliveryRow icon={ICON_SHIELD} title="Require sign-in to open" subtitle="Verify identity before viewing" on={requireSignIn} onChange={setRequireSignIn} />
                <DeliveryRow icon={ICON_WATERMARK} title="Watermark the PDF" subtitle="Deters leaks of the document" on={watermark} onChange={setWatermark} />
              </>
            )}
          </div>

          {/* ── Right: preview ────────────────────────────────────────── */}
          <div
            style={{
              flex: "1 1 0",
              minWidth: 0,
              background: "#F3F4F8",
              borderLeft: "1px solid #ECEEF8",
              padding: "16px 22px 22px",
              overflowY: "auto",
              maxHeight: "min(64vh, 560px)",
            }}
          >
            {/* Window chrome + caption */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 7 }}>
                <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#FF5F57" }} />
                <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#FEBC2E" }} />
                <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#28C840" }} />
              </div>
              <span style={{ fontSize: 11.5, color: "#9BA3C4", fontWeight: 600 }}>What the investor receives</span>
            </div>

            {/* Email card */}
            <div style={{ borderRadius: 14, overflow: "hidden", boxShadow: "0 10px 30px rgba(26,29,46,.10)", background: "#fff" }}>
              {/* Sender header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "18px 20px",
                  background: "linear-gradient(120deg,#2B1D66,#4B2FB0)",
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    background: "rgba(255,255,255,.16)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {ICON_GRID}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: "#fff" }}>{companyName} · Investor Relations</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,.72)", marginTop: 1 }}>{senderEmail}</div>
                </div>
              </div>

              {/* Email body */}
              <div style={{ padding: "18px 22px 22px" }}>
                <div style={{ fontSize: 12.5, color: "#5A6080", marginBottom: 14 }}>
                  <span style={{ color: "#9BA3C4" }}>To:</span>{" "}
                  <strong style={{ color: "#1A1D2E" }}>{recipientsLine || "—"}</strong>
                </div>
                <div style={{ fontSize: 19, fontWeight: 800, color: "#1A1D2E", lineHeight: 1.3, letterSpacing: "-.3px" }}>
                  {subject}
                </div>
                {/* Body mirrors exactly what was authored on the left. */}
                <div
                  className="chub-ext-preview-body"
                  style={{ fontSize: 13.5, color: "#3A4066", lineHeight: 1.7, marginTop: 16 }}
                  onClick={openAnchorFromEvent}
                  dangerouslySetInnerHTML={{ __html: bodyHtml }}
                />

                {/* Attached report row — hidden when the report is removed */}
                {attached && attachedReport && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      marginTop: 20,
                      padding: "14px 16px",
                      borderRadius: 12,
                      border: "1px solid #EEEFF6",
                      background: "#FBFBFE",
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        background: "#FEE9E9",
                        color: "#DC2626",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 8.5,
                        fontWeight: 800,
                        letterSpacing: ".3px",
                      }}
                    >
                      PDF
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#1A1D2E" }}>{attachedReport.title}</span>
                      <span style={{ fontSize: 11.5, color: "#9BA3C4", marginLeft: 8 }}>Download · PDF</span>
                    </div>
                    <button
                      type="button"
                      onClick={openReport}
                      style={{
                        flexShrink: 0,
                        padding: "7px 14px",
                        borderRadius: 8,
                        border: "none",
                        background: "#4040C8",
                        color: "#fff",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      View report
                    </button>
                  </div>
                )}

                {/* Tracking note — only when delivery options are shown + on */}
                {SHOW_DELIVERY_OPTIONS && trackOpens && (
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 16, fontSize: 11.5, color: "#8890AE" }}>
                    <span style={{ display: "inline-flex", color: "#9BA3C4" }}>{ICON_EYE}</span>
                    Opens &amp; downloads tracked for this send
                  </div>
                )}

                {/* Footer */}
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #F0F1F8", fontSize: 11, color: "#9BA3C4", lineHeight: 1.7 }}>
                  <div>
                    {companyName}
                    {city ? ` · ${city}` : ""} · <span style={{ color: "#7C8AB0" }}>Investor Relations</span>
                  </div>
                  <div>
                    You&apos;re on {companyName}&apos;s investor distribution list.{" "}
                    <span style={{ color: "#7C8AB0" }}>Manage preferences</span> · <span style={{ color: "#7C8AB0" }}>Unsubscribe</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 24px",
            borderTop: "1px solid #ECEEF8",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Toggle on={schedule} onChange={setSchedule} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#5A6080" }}>Schedule</span>
            {schedule && (
              <input
                type="datetime-local"
                className="chub-inp"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                style={{ ...INPUT, width: 210, padding: "6px 10px", fontSize: 12.5 }}
              />
            )}
            {formError && <span style={{ fontSize: 11.5, fontWeight: 600, color: "#DC2626" }}>{formError}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              style={{ ...BTN_SECONDARY, opacity: saving || prefillLoading || subjectEmpty ? 0.55 : 1 }}
              disabled={saving || prefillLoading || subjectEmpty}
              onClick={() => void save("draft")}
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
            <button
              type="button"
              style={{ ...BTN_PRIMARY, gap: 7, opacity: saving || prefillLoading || subjectEmpty || scheduleMissing ? 0.55 : 1 }}
              disabled={saving || prefillLoading || subjectEmpty || scheduleMissing}
              onClick={() => void save(schedule ? "scheduled" : "tracked")}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M12.5 1.5L6 8M12.5 1.5L8.3 12.5l-2.3-4.5L1.5 5.7 12.5 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              {schedule ? "Schedule send" : "Send email"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   Publish modal — opens from a row's Publish button. A static placeholder
   (later parts wire it to the backend): fill in the public listing on the
   left, preview the public IR page on the right.
═══════════════════════════════════════════════════════════════════════ */
const PUBLISH_TEAL = "#0EA5C4"

// Publish-destination icons.
const ICON_GLOBE = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="5.6" stroke="currentColor" strokeWidth="1.3" />
    <path d="M2.6 8h10.8M8 2.4c1.6 1.7 1.6 9.5 0 11.2M8 2.4c-1.6 1.7-1.6 9.5 0 11.2" stroke="currentColor" strokeWidth="1.3" />
  </svg>
)
const ICON_PORTAL = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="2.4" y="3.4" width="11.2" height="9.2" rx="1.6" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="6" cy="7.4" r="1.3" stroke="currentColor" strokeWidth="1.2" />
    <path d="M9 6.6h2.8M9 9h2.8M4 10.4c.4-1 1.1-1.4 2-1.4s1.6.4 2 1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
)
const ICON_MEGAPHONE = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 6.5v3l6 2.6V3.9L3 6.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M9 5l3.5-1.4v8.8L9 11" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M4.4 9.6l.7 3.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
)
const ICON_FILING = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 13V3M13 13H3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <rect x="5" y="7.5" width="2" height="3.5" stroke="currentColor" strokeWidth="1.2" />
    <rect x="9" y="5.5" width="2" height="5.5" stroke="currentColor" strokeWidth="1.2" />
  </svg>
)
const ICON_CAL = (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <rect x="2.2" y="3" width="9.6" height="8.4" rx="1.4" stroke="currentColor" strokeWidth="1.2" />
    <path d="M2.2 5.4h9.6M4.6 2v2M9.4 2v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
)
const ICON_EYE_SM = (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <path d="M1.4 7S3.4 3.4 7 3.4 12.6 7 12.6 7 10.6 10.6 7 10.6 1.4 7 1.4 7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    <circle cx="7" cy="7" r="1.6" stroke="currentColor" strokeWidth="1.2" />
  </svg>
)

function StatCard({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, border: "1px solid #EEEFF6", borderRadius: 12, padding: "18px 16px", background: "#fff" }}>
      <div style={{ fontSize: 21, fontWeight: 800, color: "#1A1D2E", letterSpacing: "-.5px", lineHeight: 1.15 }}>{value}</div>
      <div style={{ fontSize: 9.5, fontWeight: 800, color: "#9BA3C4", letterSpacing: ".7px", marginTop: 14 }}>{label}</div>
    </div>
  )
}

function PublishModal({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState("Financial results")
  const [headline, setHeadline] = useState("AI Noor Capital reports stable Q3 FY2025 results")
  const [summary, setSummary] = useState(
    "Net income held firm at SAR 4.2bn, supported by disciplined cost control and resilient core margins. Operating cash flow rose 6% and full-year guidance is reaffirmed. The full results deck and segment detail are available to download.",
  )
  const [pubWebsite, setPubWebsite] = useState(true)
  const [pubPortal, setPubPortal] = useState(true)
  const [pubNewsroom, setPubNewsroom] = useState(false)
  const [pubTadawul, setPubTadawul] = useState(false)
  const [schedule, setSchedule] = useState(false)

  const FIELD_LABEL: CSSProperties = {
    fontSize: 12.5,
    color: "#8890AE",
    fontWeight: 600,
    paddingTop: 10,
    width: 74,
    flexShrink: 0,
  }
  const LABEL: CSSProperties = { ...SECTION_LABEL, margin: "24px 0 4px" }

  return (
    <div style={OVERLAY} onClick={onClose}>
      <div
        style={{ ...MODAL, width: 1140, display: "flex", flexDirection: "column", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "20px 24px 16px" }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "linear-gradient(150deg,#22C3D6,#0EA5C4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 4px 12px rgba(14,165,196,.28)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 13V4.5M6.5 8L10 4.3 13.5 8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 13v2a1.2 1.2 0 0 0 1.2 1.2h9.6A1.2 1.2 0 0 0 16 15v-2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: "#9BA3C4", letterSpacing: ".9px" }}>
              PUBLISH · TO YOUR PLATFORM
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#1A1D2E", marginTop: 2, letterSpacing: "-.2px" }}>
              Publishing: Q3 FY2025 Report
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

        {/* Two columns */}
        <div style={{ display: "flex", flex: 1, minHeight: 0, borderTop: "1px solid #ECEEF8" }}>
          {/* ── Left: details ─────────────────────────────────────────── */}
          <div style={{ flex: "1 1 0", minWidth: 0, padding: "20px 24px", overflowY: "auto", maxHeight: "min(64vh, 560px)" }}>
            <div style={{ ...SECTION_LABEL, marginBottom: 4 }}>DETAILS</div>

            {/* Category */}
            <div style={{ display: "flex", gap: 18, alignItems: "flex-start", marginBottom: 14, marginTop: 14 }}>
              <span style={FIELD_LABEL}>Category</span>
              <select
                className="chub-inp"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ ...INPUT, flex: 1, cursor: "pointer" }}
              >
                <option>Financial results</option>
                <option>ESG report</option>
                <option>Board update</option>
                <option>Press release</option>
                <option>Dividend announcement</option>
              </select>
            </div>

            {/* Headline */}
            <div style={{ display: "flex", gap: 18, alignItems: "flex-start", marginBottom: 14 }}>
              <span style={FIELD_LABEL}>Headline</span>
              <input className="chub-inp" value={headline} onChange={(e) => setHeadline(e.target.value)} style={{ ...INPUT, flex: 1 }} />
            </div>

            {/* Summary */}
            <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
              <span style={FIELD_LABEL}>Summary</span>
              <textarea
                className="chub-inp"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                style={{ ...INPUT, flex: 1, minHeight: 110, resize: "vertical", lineHeight: 1.5 }}
              />
            </div>

            {/* Publish to */}
            <div style={LABEL}>PUBLISH TO</div>
            <DeliveryRow icon={ICON_GLOBE} title="Public IR website" subtitle="alnoorcapital.com/investors — anyone can view" on={pubWebsite} onChange={setPubWebsite} accent={PUBLISH_TEAL} />
            <DeliveryRow icon={ICON_PORTAL} title="Investor portal" subtitle="Logged-in investors only" on={pubPortal} onChange={setPubPortal} accent={PUBLISH_TEAL} />
            <DeliveryRow icon={ICON_MEGAPHONE} title="Newsroom / press" subtitle="Public press releases" on={pubNewsroom} onChange={setPubNewsroom} accent={PUBLISH_TEAL} />
            <DeliveryRow icon={ICON_FILING} title="Tadawul filing" subtitle="Regulatory disclosure (Saudi Exchange)" on={pubTadawul} onChange={setPubTadawul} accent={PUBLISH_TEAL} />
          </div>

          {/* ── Right: public IR page preview ─────────────────────────── */}
          <div
            style={{
              flex: "1 1 0",
              minWidth: 0,
              background: "#F3F4F8",
              borderLeft: "1px solid #ECEEF8",
              padding: "16px 22px 22px",
              overflowY: "auto",
              maxHeight: "min(64vh, 560px)",
            }}
          >
            {/* Window chrome + caption */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 7 }}>
                <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#FF5F57" }} />
                <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#FEBC2E" }} />
                <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#28C840" }} />
              </div>
              <span style={{ fontSize: 11.5, color: "#9BA3C4", fontWeight: 600 }}>Public IR page preview</span>
            </div>

            {/* Browser card */}
            <div style={{ borderRadius: 14, overflow: "hidden", boxShadow: "0 10px 30px rgba(26,29,46,.10)", background: "#fff" }}>
              {/* Site nav */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "16px 20px",
                  background: "linear-gradient(120deg,#1B1740,#2C2668)",
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: "rgba(255,255,255,.16)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <rect x="2.5" y="2.5" width="4.2" height="4.2" rx="1" stroke="#fff" strokeWidth="1.3" />
                    <rect x="9.3" y="2.5" width="4.2" height="4.2" rx="1" stroke="#fff" strokeWidth="1.3" />
                    <rect x="2.5" y="9.3" width="4.2" height="4.2" rx="1" stroke="#fff" strokeWidth="1.3" />
                    <rect x="9.3" y="9.3" width="4.2" height="4.2" rx="1" stroke="#fff" strokeWidth="1.3" />
                  </svg>
                </span>
                <span style={{ fontSize: 14, fontWeight: 800, color: "#fff", flex: 1 }}>AI Noor Capital</span>
                <div style={{ display: "flex", gap: 18, fontSize: 12, fontWeight: 600 }}>
                  <span style={{ color: "rgba(255,255,255,.6)" }}>Home</span>
                  <span style={{ color: "#fff", fontWeight: 700 }}>Investors</span>
                  <span style={{ color: "rgba(255,255,255,.6)" }}>Newsroom</span>
                  <span style={{ color: "rgba(255,255,255,.6)" }}>Governance</span>
                </div>
              </div>

              {/* Page body */}
              <div style={{ padding: "18px 22px 22px" }}>
                <div style={{ fontSize: 12, color: "#9BA3C4", marginBottom: 14 }}>Investors › News &amp; announcements</div>
                <span
                  style={{
                    display: "inline-flex",
                    padding: "4px 11px",
                    borderRadius: 20,
                    background: "#E4F5FA",
                    color: "#0E8FAD",
                    fontSize: 11.5,
                    fontWeight: 700,
                  }}
                >
                  {category}
                </span>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#1A1D2E", lineHeight: 1.25, letterSpacing: "-.4px", marginTop: 14 }}>
                  {headline}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12, fontSize: 12, color: "#8890AE", fontWeight: 600 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{ICON_CAL} Publishes today</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{ICON_EYE_SM} Public</span>
                </div>
                <div style={{ fontSize: 13.5, color: "#3A4066", lineHeight: 1.7, marginTop: 16 }}>{summary}</div>

                {/* Stat cards */}
                <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
                  <StatCard value={<>SAR 4.2bn</>} label="NET INCOME" />
                  <StatCard value={<>+6%</>} label="OPERATING CASH FLOW" />
                  <StatCard value={<>SAR 1.10</>} label="DIVIDEND /" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 24px",
            borderTop: "1px solid #ECEEF8",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Toggle on={schedule} onChange={setSchedule} color={PUBLISH_TEAL} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#5A6080" }}>Schedule</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="button" style={BTN_SECONDARY} onClick={onClose}>
              Save draft
            </button>
            <button
              type="button"
              style={{
                ...BTN_PRIMARY,
                gap: 7,
                background: PUBLISH_TEAL,
                boxShadow: "0 4px 14px rgba(14,165,196,.32)",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
                <path d="M10 13V4.5M6.5 8L10 4.3 13.5 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 13v2a1.2 1.2 0 0 0 1.2 1.2h9.6A1.2 1.2 0 0 0 16 15v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              Publish now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   History tab — Email sends + Publications sub-tabs. Read-only; wired via
   react-query hooks to the live backend.
═══════════════════════════════════════════════════════════════════════ */

// seconds → "3m 12s" / "45s"; null → "—"
function formatDuration(sec: number | null): string {
  if (sec == null) return "—"
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}
// ISO → "Jul 2, 09:14"; null → "Not opened"
function formatDayTime(iso: string | null): string {
  if (!iso) return "Not opened"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "Not opened"
  return (
    `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ` +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
  )
}
// ISO → "Jul 2, 2026"; null → "—"
function formatDay(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}
// 27.3 → "▲ +27.3%"; -4 → "▼ -4%"
function signedPct(n: number): string {
  return `${n >= 0 ? "▲ +" : "▼ "}${n}%`
}
// "investor_portal" → "Investor portal"
function prettyChannel(code: string): string {
  const s = code.replace(/_/g, " ")
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const PILL: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 9px",
  borderRadius: 20,
  fontSize: 9.5,
  fontWeight: 800,
  letterSpacing: ".5px",
}

function AudiencePill({ type }: { type: EmailAudience }) {
  const ext = type === "external"
  return (
    <span style={{ ...PILL, background: ext ? "#E7F7EE" : "#F1ECFF", color: ext ? "#15803D" : "#7C3AED" }}>
      {ext ? "EXTERNAL" : "INTERNAL"}
    </span>
  )
}

function StatusChip({ status }: { status: EmailSend["status"] }) {
  const cfg =
    status === "tracked"
      ? { dot: "#16A34A", label: "Tracked", color: "#15803D" }
      : status === "scheduled"
        ? { dot: "#F59E0B", label: "Scheduled", color: "#B45309" }
        : { dot: "#9BA3C4", label: "Draft", color: "#8890AE" }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: cfg.color }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot }} />
      {cfg.label}
    </span>
  )
}

function HistoryStatCard({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <div style={{ ...CARD, flex: 1, minWidth: 0, padding: "16px 18px" }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#9BA3C4", letterSpacing: ".6px" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "#1A1D2E", marginTop: 8, letterSpacing: "-.5px" }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, fontWeight: 600, color: subColor ?? "#8890AE", marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

function StatCards({ stats }: { stats: EmailSendsResponse["stats"] }) {
  const vsColor = stats.open_rate_vs_industry >= 0 ? "#16A34A" : "#DC2626"
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
      <HistoryStatCard label="EMAILS SENT YTD" value={String(stats.emails_sent_ytd)} sub={`${stats.external_count} external · ${stats.internal_count} internal`} />
      <HistoryStatCard label="AVG OPEN RATE" value={`${stats.avg_open_rate}%`} sub={`${signedPct(stats.open_rate_vs_industry)} vs industry`} subColor={vsColor} />
      <HistoryStatCard label="REPORT DOWNLOADS" value={`${stats.report_download_rate}%`} sub="of recipients" />
      <HistoryStatCard
        label="AVG TIME ON REPORT"
        value={formatDuration(stats.avg_time_on_report_seconds)}
        sub={
          stats.time_on_report_qoq_seconds != null
            ? `${stats.time_on_report_qoq_seconds >= 0 ? "▲ +" : "▼ "}${stats.time_on_report_qoq_seconds}s QoQ`
            : undefined
        }
        subColor={stats.time_on_report_qoq_seconds != null && stats.time_on_report_qoq_seconds < 0 ? "#DC2626" : "#16A34A"}
      />
    </div>
  )
}

function sendSubline(send: EmailSend): string {
  if (send.status === "scheduled") return `Scheduled · ${formatDayTime(send.scheduled_at)}`
  if ("opened_pct" in send.metrics) {
    return `${send.metrics.opened_pct}% opened · ${send.metrics.downloaded_pct}% downloaded`
  }
  const m = send.metrics
  const base = `${m.read_count} of ${m.total} read`
  return m.approved_count > 0 ? `${base} · ${m.approved_count} approved` : base
}

function SendRow({ send, selected, onSelect }: { send: EmailSend; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
        textAlign: "left",
        padding: "14px 18px",
        border: "none",
        borderLeft: `3px solid ${selected ? "#4040C8" : "transparent"}`,
        borderBottom: "1px solid #F0F1F8",
        background: selected ? "#F7F7FD" : "#fff",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "#1A1D2E" }}>{send.subject}</span>
          <AudiencePill type={send.audience_type} />
        </div>
        <div style={{ fontSize: 12, color: "#8890AE", marginTop: 4 }}>{sendSubline(send)}</div>
        {send.report && <div style={{ fontSize: 11.5, color: "#9BA3C4", marginTop: 3 }}>Report: {send.report.title}</div>}
      </div>
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        <StatusChip status={send.status} />
        <div style={{ fontSize: 11.5, color: "#9BA3C4", marginTop: 4 }}>
          {send.status === "scheduled" ? formatDay(send.scheduled_at) : formatDay(send.sent_at)}
        </div>
      </div>
    </button>
  )
}

const TH: CSSProperties = { fontSize: 9.5, fontWeight: 800, color: "#9BA3C4", letterSpacing: ".6px", textAlign: "left", padding: "0 12px 10px" }
const TD: CSSProperties = { fontSize: 12.5, color: "#3A4066", padding: "12px", borderTop: "1px solid #F4F5FB", verticalAlign: "top" }

function GreenValue({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: on ? "#15803D" : "#9BA3C4", fontWeight: on ? 700 : 500 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: on ? "#16A34A" : "#CBD0E4" }} />
      {children}
    </span>
  )
}

function RecipientPanel({ send }: { send: EmailSend }) {
  const { data, isLoading, isError } = useSendRecipients(send.id)
  const [exporting, setExporting] = useState(false)
  const external = send.audience_type === "external"

  const doExport = async () => {
    setExporting(true)
    try {
      await exportRecipientsCsv(send.id, send.subject)
    } catch {
      toast.error("Could not export CSV")
    } finally {
      setExporting(false)
    }
  }

  // Rendered inline directly beneath the selected send row (an expansion),
  // so the recipients read as belonging to that report.
  return (
    <div style={{ background: "#FBFCFF", borderBottom: "1px solid #F0F1F8" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "16px 18px", borderBottom: "1px solid #F0F1F8" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#1A1D2E" }}>{send.subject} — per recipient</div>
          <div style={{ fontSize: 12, color: "#8890AE", marginTop: 3 }}>
            Shared {formatDay(data?.send.sent_at ?? send.sent_at)} to {data?.send.recipient_count ?? send.recipient_count} recipients
          </div>
        </div>
        <button
          type="button"
          onClick={doExport}
          disabled={exporting || isLoading || isError}
          style={{ ...BTN_SECONDARY, flexShrink: 0, gap: 6, opacity: exporting || isLoading || isError ? 0.6 : 1 }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M7 1.5v7M4.3 6l2.7 2.7L9.7 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2.5 10.5v1.2a.9.9 0 0 0 .9.9h7.2a.9.9 0 0 0 .9-.9v-1.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {isLoading ? (
        <div style={{ padding: "40px 0", textAlign: "center", fontSize: 12.5, color: "#9BA3C4" }}>Loading recipients…</div>
      ) : isError ? (
        <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#DC2626" }}>Could not load recipients.</div>
      ) : !data || data.recipients.length === 0 ? (
        <div style={{ padding: "40px 0", textAlign: "center", fontSize: 12.5, color: "#9BA3C4" }}>No recipients.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...TH, paddingLeft: 18 }}>RECIPIENT</th>
                <th style={TH}>{external ? "OPENED" : "READ"}</th>
                <th style={TH}>{external ? "DOWNLOADED" : "APPROVED"}</th>
                {external && <th style={{ ...TH, paddingRight: 18 }}>TIME ON REPORT</th>}
              </tr>
            </thead>
            <tbody>
              {data.recipients.map((r, i) => (
                <tr key={`${r.name}-${i}`}>
                  <td style={{ ...TD, paddingLeft: 18 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span
                        style={{
                          flexShrink: 0,
                          width: 30,
                          height: 30,
                          borderRadius: "50%",
                          background: "#EEEEFF",
                          color: "#4040C8",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 10.5,
                          fontWeight: 800,
                        }}
                      >
                        {initials(r.name)}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#1A1D2E" }}>{r.name}</div>
                        {(r.org || r.contact) && (
                          <div style={{ fontSize: 11, color: "#9BA3C4" }}>{[r.org, r.contact].filter(Boolean).join(" · ")}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  {external ? (
                    <>
                      <td style={TD}>
                        <GreenValue on={!!r.opened_at}>{formatDayTime(r.opened_at)}</GreenValue>
                      </td>
                      <td style={TD}>
                        <GreenValue on={r.downloaded}>{r.downloaded ? "Yes" : "No"}</GreenValue>
                      </td>
                      <td style={{ ...TD, paddingRight: 18 }}>{formatDuration(r.time_on_report_seconds)}</td>
                    </>
                  ) : (
                    <>
                      <td style={TD}>
                        <GreenValue on={!!r.opened_at}>{r.opened_at ? formatDayTime(r.opened_at) : "Not read"}</GreenValue>
                      </td>
                      <td style={{ ...TD, paddingRight: 18 }}>
                        <GreenValue on={!!r.approved_at}>{r.approved_at ? "Yes" : "No"}</GreenValue>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function EmailSendsView() {
  const [audience, setAudience] = useState<"all" | EmailAudience>("all")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data, isLoading, isError, refetch } = useEmailSends(audience)

  const sends = data?.sends ?? []
  // Rows start collapsed; keep the open row only if it's still in the filtered
  // list. No auto-open — clicking a row toggles it.
  const effectiveId = selectedId && sends.some((s) => s.id === selectedId) ? selectedId : null
  const selected = sends.find((s) => s.id === effectiveId) ?? null

  const TOGGLE: { key: "all" | EmailAudience; label: string }[] = [
    { key: "all", label: "All" },
    { key: "external", label: "External" },
    { key: "internal", label: "Internal" },
  ]

  return (
    <>
      {isLoading && !data ? (
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ ...CARD, flex: 1, height: 92, background: "#F5F6FB" }} />
          ))}
        </div>
      ) : data ? (
        <StatCards stats={data.stats} />
      ) : null}

      {/* Audience toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {TOGGLE.map((t) => {
          const active = t.key === audience
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setAudience(t.key)}
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                border: active ? "1.5px solid #4040C8" : "1.5px solid #E5E7EF",
                background: active ? "#4040C8" : "#fff",
                color: active ? "#fff" : "#5A6080",
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {isLoading && !data ? (
        <div style={{ ...CARD, overflow: "hidden" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ height: 64, borderBottom: "1px solid #F0F1F8", background: "#FAFBFF" }} />
          ))}
        </div>
      ) : isError ? (
        <div style={{ ...CARD, padding: "48px 0", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#DC2626", marginBottom: 12 }}>Could not load email history. Please try again.</div>
          <button type="button" style={BTN_SECONDARY} onClick={() => refetch()}>
            Retry
          </button>
        </div>
      ) : sends.length === 0 ? (
        <div style={{ ...CARD, padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#9BA3C4" }}>No emails sent yet.</div>
        </div>
      ) : (
        <div style={{ ...CARD, overflow: "hidden" }}>
          {sends.map((s) => (
            <div key={s.id}>
              <SendRow
                send={s}
                selected={s.id === effectiveId}
                onSelect={() => setSelectedId((cur) => (cur === s.id ? null : s.id))}
              />
              {/* Recipients expand directly under the selected report row;
                  clicking the row again collapses it. */}
              {s.id === effectiveId && selected && <RecipientPanel key={selected.id} send={selected} />}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function PublicationsView() {
  const { data, isLoading, isError } = usePublications()

  if (isLoading) {
    return (
      <div style={{ ...CARD, overflow: "hidden" }}>
        {[0, 1].map((i) => (
          <div key={i} style={{ height: 64, borderBottom: "1px solid #F0F1F8", background: "#FAFBFF" }} />
        ))}
      </div>
    )
  }
  if (isError) {
    return (
      <div style={{ ...CARD, padding: "48px 0", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "#DC2626" }}>Could not load publications. Please try again.</div>
      </div>
    )
  }
  if (!data || data.publications.length === 0) {
    return (
      <div style={{ ...CARD, padding: 48, textAlign: "center" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "#5A6080" }}>No publications yet</div>
        <div style={{ fontSize: 12.5, color: "#9BA3C4", marginTop: 4 }}>Reports you publish to your platform will appear here.</div>
      </div>
    )
  }

  return (
    <div style={{ ...CARD, overflow: "hidden" }}>
      {data.publications.map((p, i) => (
        <div
          key={p.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "16px 18px",
            borderBottom: i === data.publications.length - 1 ? "none" : "1px solid #F0F1F8",
          }}
        >
          <FileTile kind={p.report ? reportKind(p.report.report_type) : "report"} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1A1D2E" }}>{p.report ? p.report.title : "Publication"}</div>
            <div style={{ fontSize: 12, color: "#8890AE", marginTop: 3 }}>
              {prettyChannel(p.channel)}
              {p.jurisdiction ? ` · ${p.jurisdiction}` : ""}
              {p.report ? ` · ${p.report.period}` : ""}
            </div>
            <div style={{ fontSize: 11.5, color: "#9BA3C4", marginTop: 3 }}>
              Published by {p.published_by?.full_name ?? "—"}
              {p.published_at ? ` · ${formatDay(p.published_at)}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{ ...PILL, background: "#E4F5FA", color: "#0E8FAD" }}>{p.visibility.toUpperCase()}</span>
            {p.watermarked && <span style={{ ...PILL, background: "#FEF3E2", color: "#B45309" }}>WATERMARKED</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function HistoryTab() {
  const [sub, setSub] = useState<"email-sends" | "publications">("email-sends")
  const SUBS: { key: "email-sends" | "publications"; label: string }[] = [
    { key: "email-sends", label: "Email sends" },
    { key: "publications", label: "Publications" },
  ]
  return (
    <div>
      <div style={{ display: "flex", gap: 22, borderBottom: "1px solid #ECEEF8", marginBottom: 16 }}>
        {SUBS.map((s) => {
          const active = s.key === sub
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setSub(s.key)}
              style={{
                padding: "0 2px 12px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 700,
                color: active ? "#4040C8" : "#8890AE",
                borderBottom: `2px solid ${active ? "#4040C8" : "transparent"}`,
                marginBottom: -1,
              }}
            >
              {s.label}
            </button>
          )
        })}
      </div>

      {sub === "email-sends" ? <EmailSendsView /> : <PublicationsView />}
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

// Saved-drafts dropdown — the only place drafts surface (they're not in the
// History → Email sends list). Clicking one reopens the compose modal prefilled.
function DraftsMenu({ onOpen }: { onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const { data, isLoading } = useDrafts()
  const drafts: DraftListItem[] = data ?? []

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}>
      <button type="button" style={{ ...BTN_SECONDARY, gap: 6 }} onClick={() => setOpen((v) => !v)}>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M2.5 2.5h6l3 3v6a.5.5 0 0 1-.5.5h-8.5a.5.5 0 0 1-.5-.5v-8a.5.5 0 0 1 .5-.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
        Drafts{drafts.length ? ` (${drafts.length})` : ""}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 320,
            maxWidth: "calc(100vw - 32px)",
            background: "#fff",
            border: "1px solid #E9EAF4",
            borderRadius: 14,
            boxShadow: "0 18px 50px rgba(26,29,46,.16)",
            zIndex: 60,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #F0F1F8", fontSize: 13, fontWeight: 800, color: "#1A1D2E" }}>
            Saved drafts
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {isLoading ? (
              <div style={{ padding: "28px 0", textAlign: "center", fontSize: 12, color: "#9BA3C4" }}>Loading…</div>
            ) : drafts.length === 0 ? (
              <div style={{ padding: "28px 16px", textAlign: "center", fontSize: 12.5, color: "#9BA3C4" }}>No drafts.</div>
            ) : (
              drafts.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onOpen(d.id)
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "11px 14px",
                    border: "none",
                    borderBottom: "1px solid #F4F5FB",
                    background: "#fff",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1D2E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.subject || "Untitled draft"}
                  </div>
                  <div style={{ fontSize: 11.5, color: "#9BA3C4", marginTop: 2 }}>
                    {d.recipient_count} recipient{d.recipient_count === 1 ? "" : "s"}
                    {d.report ? ` · ${d.report.title}` : ""} · {relativeTime(d.updated_at)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function CommunicationHub() {
  // A notification deep-link (…/communication?thread={id}) opens that thread.
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const threadParam = searchParams.get("thread")

  const [tab, setTab] = useState<"communication" | "history">("communication")
  const [showNew, setShowNew] = useState(false)
  const [externalThread, setExternalThread] = useState<ThreadSummary | null>(null)
  const [reopenDraftId, setReopenDraftId] = useState<string | null>(null)
  const [showPublish, setShowPublish] = useState(false)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(threadParam)

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

  // Keep the open thread in sync with the ?thread= deep-link param — covers
  // clicking a notification while already on the hub.
  useEffect(() => {
    if (threadParam) setActiveThreadId(threadParam)
  }, [threadParam])

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
    // If we arrived via the ?thread= deep-link, drop it from the URL.
    if (threadParam) router.replace(pathname)
    void fetchThreads()
  }, [fetchThreads, threadParam, router, pathname])

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
      {(externalThread || reopenDraftId) && (
        <ExternalEmailModal
          report={externalThread?.report ?? null}
          draftId={reopenDraftId ?? undefined}
          onClose={() => {
            setExternalThread(null)
            setReopenDraftId(null)
          }}
          onSaved={() => void fetchThreads()}
        />
      )}
      {showPublish && <PublishModal onClose={() => setShowPublish(false)} />}
      {showNew && <NewThreadModal onClose={() => setShowNew(false)} onCreated={() => void fetchThreads()} />}

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 25, fontWeight: 800, color: "#1A1D2E", letterSpacing: "-.4px" }}>Communication Hub</h1>
          <p style={{ fontSize: 13, color: "#7A8199", marginTop: 6, maxWidth: 620 }}>
            Every report in one place. On each one, brief the team, email investors, or publish it.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <DraftsMenu onOpen={(id) => setReopenDraftId(id)} />
          <button type="button" style={{ ...BTN_PRIMARY, gap: 7 }} onClick={() => setShowNew(true)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            New report
          </button>
        </div>
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
                <ThreadRow
                  key={t.thread_id}
                  thread={t}
                  last={i === threads.length - 1}
                  onOpen={openThread}
                  onExternal={(t) => setExternalThread(t)}
                  onPublish={() => setShowPublish(true)}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <HistoryTab />
      )}
    </div>
  )
}
