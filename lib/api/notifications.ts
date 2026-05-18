import apiClient from "./client"
import {
  NotificationListResponse,
  NotificationUnreadCountResponse,
  NotificationMarkReadResponse,
} from "@/types"

export interface NotificationsFilters {
  is_read?: boolean
  limit?: number
}

export const notificationsApi = {
  list: async (filters: NotificationsFilters = {}): Promise<NotificationListResponse> => {
    const params = new URLSearchParams()
    if (filters.is_read !== undefined) params.set("is_read", String(filters.is_read))
    if (filters.limit !== undefined) params.set("limit", String(filters.limit))
    const query = params.toString()
    const { data } = await apiClient.get(`/notifications${query ? `?${query}` : ""}`)
    return data
  },

  unreadCount: async (): Promise<NotificationUnreadCountResponse> => {
    const { data } = await apiClient.get("/notifications/unread-count")
    return data
  },

  markRead: async (notificationId: string): Promise<NotificationMarkReadResponse> => {
    const { data } = await apiClient.post(`/notifications/${notificationId}/read`)
    return data
  },

  markAllRead: async (): Promise<NotificationMarkReadResponse> => {
    const { data } = await apiClient.post("/notifications/read-all")
    return data
  },
}
