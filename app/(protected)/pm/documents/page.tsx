"use client"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { BookOpen } from "lucide-react"
export default function PMDocumentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Knowledge Base" description="Reference documents for report cycles" />
      <EmptyState icon={BookOpen} title="Knowledge Base" description="Documents and references for managing report cycles." />
    </div>
  )
}
