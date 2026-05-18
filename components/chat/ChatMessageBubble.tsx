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
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full mt-0.5",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted border border-border"
        )}
      >
        {isUser ? (
          <UserIcon className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-muted/60 border rounded-tl-sm"
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {!isUser && message.usedDocuments && (
          <div className="mt-2.5 flex items-center gap-1.5 border-t border-border/50 pt-2 text-xs text-muted-foreground">
            <FileText className="h-3 w-3 shrink-0" />
            Answered from your documents
          </div>
        )}
      </div>
    </div>
  )
}
