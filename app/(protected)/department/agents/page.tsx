"use client"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { Bot } from "lucide-react"
export default function DeptAgentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="AI Agents" description="Your personal AI assistants" />
      <EmptyState icon={Bot} title="AI Agents" description="Create custom AI agents to help you write, research, and refine your department's annual report." />
    </div>
  )
}
