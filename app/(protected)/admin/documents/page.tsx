"use client"

import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { BookOpen } from "lucide-react"

export default function AdminDocumentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Knowledge Base" description="Upload and manage reference documents" />
      <EmptyState
        icon={BookOpen}
        title="Knowledge Base"
        description="Upload documents to build a shared knowledge base. Department users and agents can reference these during report generation."
      />
    </div>
  )
}
