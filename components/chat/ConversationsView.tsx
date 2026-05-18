"use client"

import { useEffect, useRef, useState } from "react"
import {
  useConversations,
  useConversation,
  useCreateConversation,
  useSendMessage,
  useRenameConversation,
  useDeleteConversation,
  useClearHistory,
} from "@/hooks/useConversations"
import type { ConversationSummary } from "@/lib/api/chat"
import { ChatMessageBubble } from "./ChatMessageBubble"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import {
  MessageSquare, Plus, Send, Loader2, Bot, FileText,
  MoreVertical, Pencil, Trash2, Eraser,
} from "lucide-react"
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

  // Management dialog state
  const [renameTarget, setRenameTarget] = useState<ConversationSummary | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const { data: listData, isLoading: listLoading } = useConversations()
  const conversations = listData?.conversations ?? []

  const {
    data: detail,
    isLoading: detailLoading,
    isError: detailError,
  } = useConversation(selectedId ?? "")

  const createConv = useCreateConversation()
  const sendMsg = useSendMessage()
  const renameConv = useRenameConversation()
  const deleteConv = useDeleteConversation()
  const clearHist = useClearHistory()

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

  const openRename = (c: ConversationSummary) => {
    setRenameTarget(c)
    setRenameValue(c.title || "")
  }

  const submitRename = async () => {
    const title = renameValue.trim()
    if (!renameTarget || !title) return
    try {
      await renameConv.mutateAsync({ conversationId: renameTarget.conversation_id, title })
      setRenameTarget(null)
    } catch {
      /* toast handled in the hook */
    }
  }

  const submitDelete = async () => {
    if (!deleteTarget) return
    const id = deleteTarget.conversation_id
    try {
      await deleteConv.mutateAsync(id)
      // Drop the selection if the active conversation was deleted — the
      // auto-select effect then picks the next available one.
      if (id === selectedId) setSelectedId(null)
      setDeleteTarget(null)
    } catch {
      /* toast handled in the hook */
    }
  }

  const submitClear = async () => {
    if (!selectedId) return
    try {
      await clearHist.mutateAsync(selectedId)
      setConfirmClear(false)
    } catch {
      /* toast handled in the hook */
    }
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
                <div
                  key={c.conversation_id}
                  className={cn(
                    "group flex items-center border-b border-border/40 transition-colors",
                    active ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                  )}
                >
                  <button
                    onClick={() => setSelectedId(c.conversation_id)}
                    className="flex-1 min-w-0 text-left px-3 py-2.5"
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        aria-label="Conversation actions"
                        className={cn(
                          "shrink-0 rounded-md p-1.5 mr-1.5 transition-colors",
                          active
                            ? "text-primary-foreground/80 hover:bg-primary-foreground/15"
                            : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-background"
                        )}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openRename(c)}>
                        <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteTarget(c)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
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
            <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
              <h2 className="flex-1 min-w-0 text-sm font-semibold truncate">
                {detail.conversation.title || "Untitled conversation"}
              </h2>
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => setConfirmClear(true)}
                >
                  <Eraser className="h-3.5 w-3.5 mr-1" /> Clear history
                </Button>
              )}
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

      {/* ── Rename dialog ───────────────────────────────────────────────────── */}
      <Dialog
        open={!!renameTarget}
        onOpenChange={(o) => { if (!o) setRenameTarget(null) }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename conversation</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Conversation title"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                submitRename()
              }
            }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameTarget(null)}
              disabled={renameConv.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={submitRename}
              disabled={renameConv.isPending || !renameValue.trim()}
            >
              {renameConv.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ─────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}
        title="Delete conversation?"
        description={`"${deleteTarget?.title || "Untitled conversation"}" and all of its messages will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={submitDelete}
        isLoading={deleteConv.isPending}
      />

      {/* ── Clear-history confirmation ──────────────────────────────────────── */}
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear conversation history?"
        description="All messages in this conversation will be permanently removed. The conversation itself stays."
        confirmLabel="Clear history"
        variant="destructive"
        onConfirm={submitClear}
        isLoading={clearHist.isPending}
      />
    </div>
  )
}
