"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Bell, Check, CheckCheck, AlertTriangle, X, ExternalLink,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import {
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/hooks/useNotifications"
import { Notification } from "@/types"
import { formatDistanceToNow } from "date-fns"

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function sortNotifications(notifications: Notification[]): Notification[] {
  const byDate = (a: Notification, b: Notification) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()

  const unreadEsc = notifications.filter((n) => n.notification_type === "escalation" && !n.is_read)
  const readEsc   = notifications.filter((n) => n.notification_type === "escalation" &&  n.is_read)
  const others    = notifications.filter((n) => n.notification_type !== "escalation")

  return [
    ...unreadEsc.sort(byDate),
    ...readEsc.sort(byDate),
    ...others.sort((a, b) => {
      if (a.is_read !== b.is_read) return a.is_read ? 1 : -1
      return byDate(a, b)
    }),
  ]
}

// ── Priority badge ────────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority || priority === "normal")
    return <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-yellow-100 text-yellow-800">NORMAL</span>
  if (priority === "high")
    return <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-orange-100 text-orange-800">HIGH</span>
  return (
    <span className="priority-blink rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-red-100 text-red-800">
      {priority.toUpperCase()}
    </span>
  )
}

// ── Escalation card (in dropdown) ─────────────────────────────────────────────

function EscalationCard({ n, onView }: { n: Notification; onView: (id: string) => void }) {
  const { intro, rows } = parseMessage(n.message)
  const dept =
    rows.find((r) => r.key.toLowerCase() === "department")?.value ||
    n.title?.replace(/^escalation[^:]*:\s*/i, "") || ""

  return (
    <div className={`border-l-4 border-l-[#DC2626] text-sm ${n.is_read ? "bg-red-50" : "bg-[#FEF2F2]"}`}>
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
        <span className="font-bold uppercase text-red-700 text-xs tracking-wide flex-1">
          ESCALATION{dept ? ` — ${dept}` : ""}
        </span>
        <PriorityBadge priority={n.priority} />
        <span className="text-red-500 text-xs leading-none">🔴</span>
      </div>

      <div className="border-t border-red-200 mx-3" />

      {/* Parsed message rows */}
      {intro && <p className="px-3 pt-2 text-xs text-muted-foreground italic">{intro}</p>}
      <div className="px-3 pt-1.5 pb-2 space-y-0.5">
        {rows.map((r) => (
          <div key={r.key} className="flex gap-2">
            <span className="text-xs text-muted-foreground w-24 shrink-0">{r.key}:</span>
            <span className="text-xs text-foreground break-words">{r.value}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-red-200 mx-3" />

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[11px] text-muted-foreground">
          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
        </span>
        {n.related_id && (
          <Link
            href={`/sessions/${n.related_id}`}
            onClick={() => onView(n.id)}
            className="flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-900"
          >
            View <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  )
}

// ── Regular notification card ─────────────────────────────────────────────────

function RegularCard({
  n, onMarkRead, isPending,
}: { n: Notification; onMarkRead: (id: string) => void; isPending: boolean }) {
  return (
    <div className={`flex items-start gap-2 px-3 py-2.5 border-b last:border-0 ${!n.is_read ? "bg-accent/40" : ""}`}>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${!n.is_read ? "font-medium" : "text-muted-foreground"}`}>
          {n.title || n.message}
        </p>
        {n.title && n.message && (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {n.message}
          </p>
        )}
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
        </p>
      </div>
      {!n.is_read && (
        <Button
          variant="ghost" size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => onMarkRead(n.id)}
          disabled={isPending}
          title="Mark as read"
        >
          <Check className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}

// ── Escalation banner (full-width, below header) ──────────────────────────────

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
        const { rows } = parseMessage(n.message)
        const dept =
          rows.find((r) => r.key.toLowerCase() === "department")?.value ||
          n.title?.replace(/^escalation[^:]*:\s*/i, "") || ""
        const reason = rows.find((r) => r.key.toLowerCase() === "reason")?.value || ""
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

// ── Notification bell (dropdown only) ────────────────────────────────────────

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
  const [open, setOpen] = useState(false)
  const sorted = sortNotifications(notifications)

  const unreadEscalations = notifications.filter((n) => n.notification_type === "escalation" && !n.is_read)
  const unreadRegular     = notifications.filter((n) => n.notification_type !== "escalation" && !n.is_read)
  const hasUnreadEsc      = unreadEscalations.length > 0
  const anyUnread         = unreadEscalations.length + unreadRegular.length > 0

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost" size="icon"
          className={
            className ??
            `relative ${hasUnreadEsc ? "text-red-600" : "text-muted-foreground"} ${badgeOffsetClassName ?? ""}`
          }
        >
          <Bell className={`h-4 w-4 ${hasUnreadEsc ? "bell-shake" : ""}`} />

          {/* Red badge — escalations */}
          {unreadEscalations.length > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center z-10">
              {unreadEscalations.length > 9 ? "9+" : unreadEscalations.length}
            </span>
          )}
          {/* Blue badge — regular unread (offset if escalation badge also present) */}
          {unreadRegular.length > 0 && (
            <span className={`absolute h-4 min-w-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center ${
              hasUnreadEsc ? "-bottom-1 -right-1" : "-top-1 -right-1"
            }`}>
              {unreadRegular.length > 9 ? "9+" : unreadRegular.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <DropdownMenuLabel className="p-0 text-sm font-semibold">Notifications</DropdownMenuLabel>
          {anyUnread && (
            <Button
              variant="ghost" size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-3 w-3" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-[480px] overflow-y-auto divide-y">
          {sorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No notifications</p>
          ) : (
            sorted.map((n) =>
              n.notification_type === "escalation" ? (
                <EscalationCard key={n.id} n={n} onView={onView} />
              ) : (
                <RegularCard
                  key={n.id} n={n}
                  onMarkRead={(id) => markRead.mutate(id)}
                  isPending={markRead.isPending}
                />
              )
            )
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
