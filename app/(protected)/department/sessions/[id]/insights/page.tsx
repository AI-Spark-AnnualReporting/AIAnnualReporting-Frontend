"use client"

import { use } from "react"
import Link from "next/link"
import { useSession, useAdditionalInsights } from "@/hooks/useSessions"
import { PageLoader } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Sparkles, AlertTriangle } from "lucide-react"

export default function AdditionalInsightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const { data: sessionData, isLoading: sessionLoading } = useSession(id)
  const { data, isLoading, isError } = useAdditionalInsights(id)

  const session = sessionData?.session

  if (sessionLoading || isLoading) return <PageLoader />

  const items = data?.items ?? []
  const hasContent = data?.has_content ?? items.length > 0

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/department/sessions/${id}`}>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-xl border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Additional Insights{session?.department_name ? ` — ${session.department_name}` : ""}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Content from your uploaded documents that wasn&apos;t used in your answers, but could still strengthen this report.
            </p>
          </div>
        </div>
      </div>

      {isError ? (
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load additional insights"
          description="Something went wrong. Please try again later."
        />
      ) : !hasContent || items.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Nothing extra found"
          description="Everything useful in your uploaded documents is already reflected in your answers."
        />
      ) : (
        <div className="space-y-4">
          {items.map((item, i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
                {item.relates_to && (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-indigo-200 bg-indigo-50 text-indigo-700"
                  >
                    {item.relates_to}
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.summary}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
