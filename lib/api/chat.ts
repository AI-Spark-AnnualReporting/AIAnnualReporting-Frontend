import apiClient from "./client"

export interface CreateConversationPayload {
  document_id?: string
  title?: string
}

export interface ConversationMessage {
  role: "user" | "assistant"
  content: string
  timestamp?: string
}

export interface Conversation {
  conversation_id: string
  id?: string
  title?: string
  messages: ConversationMessage[]
}

export interface SendMessageResponse {
  assistant_message?: { content: string }
  content?: string
  message?: string
}

export const chatApi = {
  /**
   * Create a new conversation, optionally linked to a document for RAG grounding.
   * Returns { conversation_id }
   */
  createConversation: async (payload: CreateConversationPayload = {}) => {
    const { data } = await apiClient.post("/chat/conversations", payload)
    return data as { conversation_id: string; id?: string }
  },

  /**
   * Send a message to an existing conversation.
   * Returns { assistant_message: { content } }
   */
  sendMessage: async (conversationId: string, message: string) => {
    const { data } = await apiClient.post(
      `/chat/conversations/${conversationId}/messages`,
      { message }
    )
    return data as SendMessageResponse
  },

  /**
   * Fetch the full message history of a conversation.
   */
  getConversation: async (conversationId: string) => {
    const { data } = await apiClient.get(`/chat/conversations/${conversationId}`)
    return data as Conversation
  },

  /**
   * List all conversations for the current user.
   */
  listConversations: async () => {
    const { data } = await apiClient.get("/chat/conversations")
    return data as Conversation[]
  },
}
