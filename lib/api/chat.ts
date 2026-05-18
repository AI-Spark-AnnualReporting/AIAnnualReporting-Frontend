import apiClient from "./client"

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreateConversationPayload {
  title?: string
  /** Kept for backward-compat — the session workspace may pass it; harmless. */
  document_id?: string
}

/** A single message exactly as the API returns/accepts it. */
export interface ConversationMessage {
  role: "user" | "assistant"
  content: string
  timestamp?: string
}

/** Conversation row from GET /chat/conversations (list). */
export interface ConversationSummary {
  conversation_id: string
  title: string
  created_at: string
  updated_at: string | null
  message_count: number | null
}

/** Conversation object nested inside GET /chat/{id}. */
export interface ConversationDetail {
  conversation_id: string
  title: string
  created_at: string
  updated_at?: string | null
  message_count?: number | null
}

/**
 * Backward-compat alias for the shape the session workspace expects.
 * Superset of ConversationDetail so older `conv.id` / `conv.messages` refs compile.
 */
export interface Conversation extends ConversationDetail {
  id?: string
  messages?: ConversationMessage[]
}

export interface StartConversationResponse {
  success: boolean
  conversation_id: string
  /** alias kept for the workspace's `conv.conversation_id || conv.id` fallback */
  id?: string
  title: string
  created_at: string
}

export interface ListConversationsResponse {
  success: boolean
  conversations: ConversationSummary[]
  total: number
}

export interface GetConversationResponse {
  success: boolean
  conversation: ConversationDetail
  messages: ConversationMessage[]
  message_count: number
}

export interface SendMessageResponse {
  success: boolean
  conversation_id: string
  user_message: string
  assistant_response: string
  used_documents: boolean
  /** legacy optional fields — kept so the workspace's extractContent typing compiles */
  assistant_message?: { content: string }
  content?: string
  message?: string
}

// ── API ──────────────────────────────────────────────────────────────────────

export const chatApi = {
  /**
   * Create a new conversation. POST /chat/start (NOT /chat/conversations — that 405s).
   */
  createConversation: async (payload: CreateConversationPayload = {}) => {
    const { data } = await apiClient.post("/chat/start", payload)
    return data as StartConversationResponse
  },

  /** List every conversation for the current user. GET /chat/conversations */
  listConversations: async () => {
    const { data } = await apiClient.get("/chat/conversations")
    return data as ListConversationsResponse
  },

  /** Fetch one conversation with its full message history. GET /chat/{id} */
  getConversation: async (conversationId: string) => {
    const { data } = await apiClient.get(`/chat/${conversationId}`)
    return data as GetConversationResponse
  },

  /**
   * Send a message. POST /chat/{id}/message.
   * `useDocuments` controls RAG grounding — when omitted the backend defaults it to true.
   * May take several seconds (embed + vector search + LLM).
   */
  sendMessage: async (
    conversationId: string,
    message: string,
    useDocuments?: boolean
  ) => {
    const body: { message: string; use_documents?: boolean } = { message }
    if (useDocuments !== undefined) body.use_documents = useDocuments
    const { data } = await apiClient.post(`/chat/${conversationId}/message`, body)
    return data as SendMessageResponse
  },
}
