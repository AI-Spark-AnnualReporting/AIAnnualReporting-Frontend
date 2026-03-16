"use client"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { MessageSquare } from "lucide-react"
export default function PMConversationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Conversations" description="AI-powered document conversations" />
      <EmptyState icon={MessageSquare} title="Conversations" description="Chat with documents to extract insights for your report cycles." />
    </div>
  )
}
