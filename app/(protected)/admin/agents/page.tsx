"use client"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { Bot } from "lucide-react"

export default function AdminAgentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="AI Agents" description="Create and manage custom AI assistants" />
      <EmptyState
        icon={Bot}
        title="Custom AI Agents"
        description="Create specialized AI agents with custom instructions and document access to assist with annual report tasks."
      />
    </div>
  )
}
