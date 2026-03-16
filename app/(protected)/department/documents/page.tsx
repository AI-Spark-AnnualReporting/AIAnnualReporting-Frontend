"use client"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { BookOpen } from "lucide-react"
export default function DeptDocumentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Knowledge Base" description="Reference documents for your department" />
      <EmptyState icon={BookOpen} title="Knowledge Base" description="Access shared documents and upload your own references for the annual report." />
    </div>
  )
}
