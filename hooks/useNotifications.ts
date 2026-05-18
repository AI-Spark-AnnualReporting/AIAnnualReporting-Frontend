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
