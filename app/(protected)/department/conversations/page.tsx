"use client"

import { PageHeader } from "@/components/ui/page-header"
import { ConversationsView } from "@/components/chat/ConversationsView"

export default function DeptConversationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Conversations" description="Chat with your documents using AI" />
      <ConversationsView />
    </div>
  )
}
