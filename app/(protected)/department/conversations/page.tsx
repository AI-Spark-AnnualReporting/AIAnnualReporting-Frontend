"use client"

import { ConversationsView } from "@/components/chat/ConversationsView"

export default function DeptConversationsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Conversations</h1>
        <p className="mt-1.5 text-base text-slate-500">Chat with your documents using AI</p>
      </div>
      <ConversationsView />
    </div>
  )
}
