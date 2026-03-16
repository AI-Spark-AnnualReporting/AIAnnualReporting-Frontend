"use client"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { MessageSquare } from "lucide-react"
export default function DeptConversationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Conversations" description="Chat with documents using AI" />
      <EmptyState icon={MessageSquare} title="Document Chat" description="Upload documents and ask questions using AI to help craft your department's annual report." />
    </div>
  )
}
