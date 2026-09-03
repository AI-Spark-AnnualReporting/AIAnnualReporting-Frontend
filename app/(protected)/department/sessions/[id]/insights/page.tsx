"use client"

import { use } from "react"
import Link from "next/link"
import { useSession, useAdditionalInsights, useSetInsightInclusion } from "@/hooks/useSessions"
import { PageLoader } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Sparkles, AlertTriangle, Plus, Check, Loader2 } from "lucide-react"

export default function AdditionalInsightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const { data: sessionData, isLoading: sessionLoading } = useSession(id)
  const { data, isLoading, isError } = useAdditionalInsights(id)
  const setInclusion = useSetInsightInclusion(id)

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

      {hasContent && items.length > 0 && (
        <p className="rounded-lg bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
          Included cards are folded into your outline and draft the next time you generate them.
        </p>
      )}

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
          {items.map((item) => {
            const isPending =
              setInclusion.isPending && setInclusion.variables?.insightId === item.id

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 text-base font-semibold text-slate-900">{item.title}</h3>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {item.relates_to && (
                      <Badge
                        variant="outline"
                        className="border-indigo-200 bg-indigo-50 text-indigo-700"
                      >
                        {item.relates_to}
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant={item.included ? "default" : "outline"}
                      className={
                        item.included
                          ? "h-8 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                          : "h-8 rounded-lg border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }
                      disabled={isPending}
                      onClick={() =>
                        setInclusion.mutate({ insightId: item.id, included: !item.included })
                      }
                    >
                      {isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : item.included ? (
                        <>
                          <Check className="mr-1.5 h-3.5 w-3.5" /> Included
                        </>
                      ) : (
                        <>
                          <Plus className="mr-1.5 h-3.5 w-3.5" /> Include
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.summary}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
