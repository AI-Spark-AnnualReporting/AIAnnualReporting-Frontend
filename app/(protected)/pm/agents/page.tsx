"use client"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { Bot } from "lucide-react"
export default function PMAgentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="AI Agents" description="Custom AI assistants for cycle management" />
      <EmptyState icon={Bot} title="AI Agents" description="Create and use custom agents to assist with report cycle management." />
    </div>
  )
}
