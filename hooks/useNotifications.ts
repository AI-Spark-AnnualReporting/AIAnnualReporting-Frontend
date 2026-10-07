import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { notificationsApi, NotificationsFilters } from "@/lib/api/notifications"
import { useAuth } from "@/contexts/AuthContext"
import { toast } from "sonner"

const NOTIFICATIONS_KEY = ["notifications"]
const UNREAD_COUNT_KEY = ["notifications", "unread-count"]

/** Background poll — always runs when authenticated. Powers bell state + escalation banner. */
export function useNotificationsLive() {
  const { isAuthenticated } = useAuth()
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, { limit: 50 }],
    queryFn: () => notificationsApi.list({ limit: 50 }),
    enabled: isAuthenticated,
    staleTime: 30_000,
    refetchInterval: isAuthenticated ? 60_000 : false,
    refetchIntervalInBackground: false,
  })
}

/**
 * Retry a failed fact read from the notification itself.
 *
 * The role is read here rather than passed in, so the bell needs no new props
 * and none of the three top navs change. On success the backend deletes the
 * notice for every recipient, so invalidating the list is what makes the row
 * disappear — for the other person too, on their next poll.
 */
export function useRetryClaimExtraction() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const role = user?.role === "hod" ? "hod" : "pm"
  return useMutation({
    mutationFn: (sessionId: string) =>
      notificationsApi.retryClaimExtraction(role, sessionId),
    onSuccess: () => {
      toast.success("Facts read successfully")
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY })
    },
    // Say what the server said. A fixed message here hid a 401, a 403 and a
    // 502 behind one sentence, which made a failure impossible to act on
    // without opening devtools.
    onError: (err: unknown) => toast.error(retryError(err)),
  })
}

/* Turn an axios failure into something the PM can act on.

   The status matters more than the text: 401 means the session lapsed and the
   fix is to sign in again, 403 means this cycle is not theirs, 502 means the
   read genuinely failed again and retrying later is the right move. */
function retryError(err: unknown): string {
  const e = err as {
    response?: { status?: number; data?: { detail?: string } }
    code?: string
  }
  const detail = e?.response?.data?.detail
  const status = e?.response?.status

  if (e?.code === "ECONNABORTED") {
    return "The read took too long and was cut off. Try again."
  }
  if (status === 401) return "Your session expired — sign in again to retry."
  if (status === 403) return "You don't have access to this cycle."
  if (status === 404) return "That department's session no longer exists."
  if (typeof detail === "string" && detail.trim()) return detail
  if (status) return `Couldn't read the facts (error ${status}). Try again shortly.`
  return "Couldn't reach the server. Check your connection and try again."
}

/** Lazy load — only fetches when `enabled` is true (e.g. dropdown open). Reuses live cache. */
export function useNotifications(filters: NotificationsFilters & { enabled?: boolean } = {}) {
  const { isAuthenticated } = useAuth()
  const { enabled = true, ...apiFilters } = filters
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, apiFilters],
    queryFn: () => notificationsApi.list(apiFilters),
    staleTime: 30_000,
    enabled: isAuthenticated && enabled,
  })
}

export function useUnreadCount() {
  const { isAuthenticated } = useAuth()
  return useQuery({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: () => notificationsApi.unreadCount(),
    staleTime: 30_000,
    refetchInterval: isAuthenticated ? 60_000 : false,
    enabled: isAuthenticated,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (notificationId: string) => notificationsApi.markRead(notificationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY })
      qc.invalidateQueries({ queryKey: UNREAD_COUNT_KEY })
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to mark notification as read")
    },
  })
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY })
      qc.invalidateQueries({ queryKey: UNREAD_COUNT_KEY })
      toast.success("All notifications marked as read")
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to mark all notifications as read")
    },
  })
}
