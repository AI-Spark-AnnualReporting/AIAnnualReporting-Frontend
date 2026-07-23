"use client"

import { CSSProperties, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { formatDistanceToNow } from "date-fns"
import type { CommunicationMember } from "@/lib/api/communications"

/**
 * Shared primitives for the report review & approval flow.
 *
 * Styles are inline and self-contained, matching CommunicationHub — this app
 * has no global CSS classes for buttons/cards/inputs.
 */

// ── Inline styles ─────────────────────────────────────────────────────────
export const CARD: CSSProperties = {
  background: "#fff",
  border: "1px solid #E2E4F0",
  borderRadius: 16,
  boxShadow: "0 2px 12px rgba(64,64,200,.06)",
}
export const BTN_PRIMARY: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
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
export const BTN_SECONDARY: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
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
export const BADGE_GRAY: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "3px 9px",
  borderRadius: 20,
  fontSize: 10,
  fontWeight: 700,
  background: "#E8EAF5",
  color: "#5A6080",
}
export const INPUT: CSSProperties = {
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
export const OVERLAY: CSSProperties = {
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
export const MODAL: CSSProperties = {
  background: "#fff",
  borderRadius: 20,
  maxWidth: "96vw",
  boxShadow: "0 24px 80px rgba(0,0,0,.22)",
}
export const SECTION_LABEL: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: "#9BA3C4",
  letterSpacing: ".7px",
  marginBottom: 10,
}
export const RAIL_LABEL: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: ".6px",
  textTransform: "uppercase",
  color: "#8890AE",
  marginBottom: 10,
}

// ── Helpers ───────────────────────────────────────────────────────────────

// Normalized axios errors reject as { error, message, status, details }.
export function statusOf(e: unknown): number | undefined {
  return typeof e === "object" && e !== null && "status" in e
    ? (e as { status?: number }).status
    : undefined
}

// FastAPI {"detail": "…"} strings are written to be shown to the user as-is.
// The commClient interceptor already lifts `detail` into `message`.
export function detailMessage(e: unknown, fallback: string): string {
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message?: unknown }).message
    if (typeof m === "string" && m) return m
  }
  return fallback
}

// "Aizaz Zulfiqar" → "Aizaz Z."; single name → unchanged.
export function abbreviateName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length < 2) return parts[0] ?? ""
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

// ISO timestamp → "2 hours ago", "just now", etc.
export function relativeTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return formatDistanceToNow(d, { addSuffix: true })
}

// "department_user" → "Department User"
export function roleLabel(role: string): string {
  return role
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
}

export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function Spinner({ size = 34 }: { size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: "3px solid #E2E4F0",
        borderTopColor: "#4040C8",
        display: "inline-block",
        animation: "chub-spin .8s linear infinite",
      }}
    />
  )
}

// ── Shared @mention composer ──────────────────────────────────────────────
// Controlled: the parent owns `message` + `mentions`. Typing "@" opens a
// client-side-filtered picker; selecting a member adds a removable chip and
// strips the "@query" from the text (the mention lives in the chip). The
// parent sends `mentions.map(m => m.id)` — the UUID, not `user_id`.
export function MentionComposer({
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
