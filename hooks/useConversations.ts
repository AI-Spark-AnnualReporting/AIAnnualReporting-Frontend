import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  chatApi,
  ConversationMessage,
  GetConversationResponse,
} from "@/lib/api/chat"
import { toast } from "sonner"

// ── View-model types ─────────────────────────────────────────────────────────

/**
 * A message as held in the React Query cache / rendered in the UI.
 * Widens the API-pure ConversationMessage with `usedDocuments`, which is only
 * known for messages produced in-session by a send (history from GET /chat/{id}
 * does not carry it). Kept separate so this client-only field never leaks into
 * a request body.
 */
export interface ChatMessageVM extends ConversationMessage {
  usedDocuments?: boolean
}

/** Cached shape of a single conversation's detail. */
export type ConversationDetailData = Omit<GetConversationResponse, "messages"> & {
  messages: ChatMessageVM[]
}

// ── Query keys ───────────────────────────────────────────────────────────────

export const conversationKeys = {
  all: ["conversations"] as const,
  list: () => [...conversationKeys.all, "list"] as const,
  detail: (id: string) => [...conversationKeys.all, "detail", id] as const,
}

// ── Queries ──────────────────────────────────────────────────────────────────

export function useConversations() {
  return useQuery({
    queryKey: conversationKeys.list(),
    queryFn: () => chatApi.listConversations(),
  })
}

export function useConversation(conversationId: string) {
  return useQuery({
    queryKey: conversationKeys.detail(conversationId),
    queryFn: async (): Promise<ConversationDetailData> =>
      chatApi.getConversation(conversationId),
    enabled: !!conversationId,
    retry: false, // surface a 404 (deleted conversation) immediately
  })
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function useCreateConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (title?: string) =>
      chatApi.createConversation(title ? { title } : {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: conversationKeys.list() })
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to start a conversation")
    },
  })
}

interface SendMessageVars {
  conversationId: string
  message: string
  useDocuments: boolean
}

export function useSendMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, message, useDocuments }: SendMessageVars) =>
      chatApi.sendMessage(conversationId, message, useDocuments),

    // Optimistically append the user's message so it shows instantly.
    onMutate: async ({ conversationId, message }) => {
      await qc.cancelQueries({ queryKey: conversationKeys.detail(conversationId) })
      const previous = qc.getQueryData<ConversationDetailData>(
        conversationKeys.detail(conversationId)
      )
      if (previous) {
        qc.setQueryData<ConversationDetailData>(
          conversationKeys.detail(conversationId),
          {
            ...previous,
            messages: [
              ...previous.messages,
              { role: "user", content: message, timestamp: new Date().toISOString() },
            ],
          }
        )
      }
      return { previous }
    },

    // Merge the assistant's reply into the cached detail (the send response
    // only returns the latest exchange, not the full history).
    onSuccess: (data, vars) => {
      const current = qc.getQueryData<ConversationDetailData>(
        conversationKeys.detail(vars.conversationId)
      )
      if (current) {
        qc.setQueryData<ConversationDetailData>(
          conversationKeys.detail(vars.conversationId),
          {
            ...current,
            messages: [
              ...current.messages,
              {
                role: "assistant",
                content: data.assistant_response,
                timestamp: new Date().toISOString(),
                usedDocuments: data.used_documents,
              },
            ],
            message_count: current.messages.length + 1,
          }
        )
      }
    },

    onError: (
      err: { message?: string },
      _vars,
      ctx: { previous?: ConversationDetailData } | undefined
    ) => {
      if (ctx?.previous) {
        qc.setQueryData(
          conversationKeys.detail(ctx.previous.conversation.conversation_id),
          ctx.previous
        )
      }
      toast.error(err?.message || "Failed to send message")
    },

    // Refresh the list (message_count / updated_at) but NEVER the detail —
    // a refetch would drop the optimistically merged assistant message.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: conversationKeys.list() })
    },
  })
}
