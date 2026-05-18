"use client"

import { useEffect, useRef, useState } from "react"
import {
  useConversations,
  useConversation,
  useCreateConversation,
  useSendMessage,
} from "@/hooks/useConversations"
import { ChatMessageBubble } from "./ChatMessageBubble"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/ui/empty-state"
import { MessageSquare, Plus, Send, Loader2, Bot, FileText } from "lucide-react"
import { cn, formatDate } from "@/lib/utils"

/** Bouncing-dots typing indicator — shown while awaiting the assistant reply. */
function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted border border-border">
        <Bot className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-muted/60 border px-5 py-4">
        <div className="flex gap-1.5 items-center">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "160ms" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "320ms" }} />
        </div>
      </div>
    </div>
  )
}

export function ConversationsView() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [useDocuments, setUseDocuments] = useState(true)
  const [input, setInput] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { data: listData, isLoading: listLoading } = useConversations()
  const conversations = listData?.conversations ?? []

  const {
    data: detail,
    isLoading: detailLoading,
    isError: detailError,
  } = useConversation(selectedId ?? "")

  const createConv = useCreateConversation()
  const sendMsg = useSendMessage()

  // Auto-select the first conversation once the list loads — never clobber a
  // manual pick (only act while nothing is selected).
  useEffect(() => {
    if (selectedId === null && conversations.length > 0) {
      setSelectedId(conversations[0].conversation_id)
    }
  }, [conversations, selectedId])

  // Auto-scroll to the newest message.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [detail?.messages, sendMsg.isPending])

  const handleCreate = async () => {
    try {
      const res = await createConv.mutateAsync(undefined)
      setSelectedId(res.conversation_id)
    } catch {
      /* toast handled in the hook */
    }
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text || !selectedId || sendMsg.isPending) return
    sendMsg.mutate({ conversationId: selectedId, message: text, useDocuments })
    setInput("")
  }

  const messages = detail?.messages ?? []

  return (
    <div className="flex gap-4 h-[calc(100vh-12rem)]">
      {/* ── Left pane — conversation list ───────────────────────────────────── */}
      <div className="w-72 shrink-0 flex flex-col rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2.5 border-b shrink-0">
          <p className="text-sm font-semibold">Conversations</p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={handleCreate}
            disabled={createConv.isPending}
          >
            {createConv.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Plus className="h-3.5 w-3.5 mr-1" /> New
              </>
            )}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {listLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No conversations yet"
              description="Start chatting with your documents using AI."
              action={
                <Button size="sm" onClick={handleCreate} disabled={createConv.isPending}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Start a conversation
                </Button>
              }
            />
          ) : (
            conversations.map((c) => {
              const active = c.conversation_id === selectedId
              return (
                <button
                  key={c.conversation_id}
                  onClick={() => setSelectedId(c.conversation_id)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 border-b border-border/40 transition-colors",
                    active ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                  )}
                >
                  <p className="text-sm font-medium truncate">
                    {c.title || "Untitled conversation"}
                  </p>
                  <div
                    className={cn(
                      "flex items-center gap-1.5 mt-0.5 text-xs",
                      active ? "text-primary-foreground/70" : "text-muted-foreground"
                    )}
                  >
                    <span>{formatDate(c.updated_at ?? c.created_at)}</span>
                    {c.message_count != null && (
                      <span>· {c.message_count} msg{c.message_count === 1 ? "" : "s"}</span>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Right pane — chat panel ─────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col rounded-xl border bg-card overflow-hidden">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={MessageSquare}
              title="Select a conversation"
              description="Choose a conversation on the left, or start a new one."
            />
          </div>
        ) : detailLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : detailError ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={MessageSquare}
              title="Conversation not found"
              description="This conversation may have been deleted."
              action={
                <Button variant="outline" size="sm" onClick={() => setSelectedId(null)}>
                  Back to conversations
                </Button>
              }
            />
          </div>
        ) : detail ? (
          <>
            {/* Header */}
            <div className="px-4 py-3 border-b shrink-0">
              <h2 className="text-sm font-semibold truncate">
                {detail.conversation.title || "Untitled conversation"}
              </h2>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
              {messages.length === 0 && !sendMsg.isPending ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-3">
                    <MessageSquare className="h-6 w-6 text-primary" />
                  </div>
                  <p className="text-sm font-semibold">Ask your first question</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                    Ask anything about your uploaded documents — financials, projects, KPIs, and more.
                  </p>
                </div>
              ) : (
                <>
                  {messages.map((m, i) => (
                    <ChatMessageBubble key={i} message={m} />
                  ))}
                  {sendMsg.isPending && <TypingIndicator />}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <div className="border-t shrink-0 p-3 space-y-2">
              <div className="flex items-end gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder="Ask a question… (Enter to send, Shift+Enter for a new line)"
                  rows={1}
                  className="resize-none min-h-[40px] max-h-32 text-sm"
                />
                <Button
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={handleSend}
                  disabled={!input.trim() || sendMsg.isPending}
                >
                  {sendMsg.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <button
                type="button"
                onClick={() => setUseDocuments((v) => !v)}
                title="Toggle whether the AI grounds answers in your uploaded documents"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  useDocuments
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent"
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                {useDocuments ? "Using my documents" : "Not using documents"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
