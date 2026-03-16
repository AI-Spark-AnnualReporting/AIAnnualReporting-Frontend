"use client"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { MessageSquare } from "lucide-react"

export default function AdminConversationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Conversations" description="Chat with your documents using AI" />
      <EmptyState
        icon={MessageSquare}
        title="Document Conversations"
        description="Upload a document and start an AI-powered conversation to extract insights and information."
      />
    </div>
  )
}
