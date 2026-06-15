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
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500">
        <Bot className="h-4 w-4" />
      </div>
      <div className="rounded-2xl rounded-tl-sm border border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "0ms" }} />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "160ms" }} />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "320ms" }} />
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
    <div className="flex h-[calc(100vh-13rem)] min-h-[480px] gap-5">
      {/* ── Left pane — conversation list ───────────────────────────────────── */}
      <div className="flex w-80 shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3.5">
          <p className="text-base font-bold text-slate-900">Conversations</p>
          <Button
            size="sm"
            className="h-8 bg-indigo-50 text-xs font-semibold text-indigo-600 shadow-none hover:bg-indigo-100"
            onClick={handleCreate}
            disabled={createConv.isPending}
          >
            {createConv.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Plus className="mr-1 h-3.5 w-3.5" /> New
              </>
            )}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {listLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : conversations.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No conversations yet"
              description="Start chatting with your documents using AI."
              action={
                <Button
                  size="sm"
                  className="bg-indigo-600 text-white hover:bg-indigo-700"
                  onClick={handleCreate}
                  disabled={createConv.isPending}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Start a conversation
                </Button>
              }
            />
          ) : (
            <div className="space-y-1">
              {conversations.map((c) => {
                const active = c.conversation_id === selectedId
                return (
                  <div
                    key={c.conversation_id}
                    className={cn(
                      "group flex items-center rounded-xl transition-colors",
                      active ? "bg-indigo-600 text-white" : "hover:bg-slate-50"
                    )}
                  >
                    <button
                      onClick={() => setSelectedId(c.conversation_id)}
                      className="min-w-0 flex-1 px-3 py-2.5 text-left"
                    >
                      <p className="truncate text-sm font-semibold">
                        {c.title || "Untitled conversation"}
                      </p>
                      <div
                        className={cn(
                          "mt-0.5 flex items-center gap-1.5 text-xs",
                          active ? "text-indigo-100/80" : "text-slate-400"
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
                            "mr-1.5 shrink-0 rounded-md p-1.5 transition-colors",
                            active
                              ? "text-indigo-100/80 hover:bg-white/15"
                              : "text-slate-400 opacity-0 hover:bg-slate-100 group-hover:opacity-100"
                          )}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openRename(c)}>
                          <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(c)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Right pane — chat panel ─────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {!selectedId ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={MessageSquare}
              title="Select a conversation"
              description="Choose a conversation on the left, or start a new one."
            />
          </div>
        ) : detailLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : detailError ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={MessageSquare}
              title="Conversation not found"
              description="This conversation may have been deleted."
              action={
                <Button variant="outline" size="sm" className="border-slate-200 bg-white" onClick={() => setSelectedId(null)}>
                  Back to conversations
                </Button>
              }
            />
          </div>
        ) : detail ? (
          <>
            {/* Header */}
            <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-5 py-3.5">
              <h2 className="min-w-0 flex-1 truncate text-base font-bold text-slate-900">
                {detail.conversation.title || "Untitled conversation"}
              </h2>
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 text-xs text-slate-500 hover:text-destructive"
                  onClick={() => setConfirmClear(true)}
                >
                  <Eraser className="mr-1 h-3.5 w-3.5" /> Clear history
                </Button>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              {messages.length === 0 && !sendMsg.isPending ? (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50">
                    <MessageSquare className="h-6 w-6 text-indigo-600" />
                  </div>
                  <p className="text-base font-bold text-slate-900">Ask anything about your documents</p>
                  <p className="mt-1 max-w-xs text-sm text-slate-500">
                    Your answers are grounded in the files in your Document Bank.
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
            <div className="shrink-0 space-y-2.5 border-t border-slate-100 p-4">
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
                  className="max-h-32 min-h-[44px] resize-none rounded-xl border-slate-200 text-sm"
                />
                <Button
                  size="icon"
                  className="h-11 w-11 shrink-0 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700"
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
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  useDocuments
                    ? "border-indigo-200 bg-indigo-50 text-indigo-600"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50"
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
