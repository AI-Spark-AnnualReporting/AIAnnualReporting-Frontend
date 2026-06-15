"use client"

import { Bot, User as UserIcon, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ChatMessageVM } from "@/hooks/useConversations"

/** A single chat message bubble — styling mirrors the session-workspace chat. */
export function ChatMessageBubble({ message }: { message: ChatMessageVM }) {
  const isUser = message.role === "user"

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-indigo-600 text-white"
            : "border border-slate-200 bg-white text-slate-500"
        )}
      >
        {isUser ? (
          <UserIcon className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "rounded-tr-sm bg-indigo-600 text-white"
            : "rounded-tl-sm border border-slate-200 bg-slate-50 text-slate-700"
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {!isUser && message.usedDocuments && (
          <div className="mt-2.5 flex items-center gap-1.5 border-t border-slate-200 pt-2 text-xs text-slate-500">
            <FileText className="h-3 w-3 shrink-0" />
            Answered from your documents
          </div>
        )}
      </div>
    </div>
  )
}
