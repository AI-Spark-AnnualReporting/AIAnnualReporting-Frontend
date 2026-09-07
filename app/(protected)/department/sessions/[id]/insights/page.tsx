"use client"

import { use, useState } from "react"
import Link from "next/link"
import {
  useSession,
  useAdditionalInsights,
  useSetInsightInclusion,
  useInsightSources,
} from "@/hooks/useSessions"
import { PageLoader, Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  ArrowLeft,
  Sparkles,
  AlertTriangle,
  Plus,
  Check,
  Loader2,
  ChevronDown,
} from "lucide-react"

/**
 * The exact document text one card was summarized from.
 *
 * Rendered for every card but fetched only for the open one — passing "" for
 * insightId disables the query (see useInsightSources), so opening a card is
 * what triggers the request. The hook must be called unconditionally, hence
 * the early return sits *after* it.
 */
function VerbatimSources({
  sessionId,
  insightId,
  open,
  isRtl,
}: {
  sessionId: string
  insightId: string
  open: boolean
  isRtl: boolean
}) {
  const { data, isLoading, isError } = useInsightSources(sessionId, open ? insightId : "")

  if (!open) return null

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-4 text-sm text-slate-500">
        <Spinner className="h-4 w-4" /> Loading source text…
      </div>
    )
  }
  if (isError) {
    return (
      <p className="border-t border-slate-100 px-5 py-4 text-sm text-red-600">
        Couldn&apos;t load the source text.
      </p>
    )
  }

  const sources = data?.sources ?? []
  if (sources.length === 0) {
    return (
      <p className="border-t border-slate-100 px-5 py-4 text-sm text-slate-500">
        No source text recorded for this card.
      </p>
    )
  }

  return (
    <div className="space-y-3 border-t border-slate-100 px-5 py-4">
      {sources.map((src) => (
        <div key={src.chunk_id}>
          <p className="mb-1.5 text-xs font-medium text-slate-500">
            {src.document_filename} · section {src.chunk_index}
          </p>
          {/* dir alone doesn't right-align in every context, so pair it with
              text-right for Arabic — the convention used on the outline page. */}
          <div
            dir={isRtl ? "rtl" : "ltr"}
            className={cn(
              "max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700",
              isRtl && "text-right"
            )}
          >
            {src.content}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AdditionalInsightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const { data: sessionData, isLoading: sessionLoading } = useSession(id)
  const { data, isLoading, isFetching, isError } = useAdditionalInsights(id)
  const setInclusion = useSetInsightInclusion(id)

  // One card's source open at a time — the source blocks are long, and two
  // expanded at once makes them hard to tell apart.
  const [openSourceId, setOpenSourceId] = useState<string | null>(null)

  const session = sessionData?.session
  const isRtl = (session?.content_language ?? "english") === "arabic"

  // isFetching, not just isLoading: after an upload/extraction this query is
  // invalidated and refetched while it still holds the PREVIOUS result. isLoading
  // is false whenever cached data exists, so gating on it alone would render the
  // stale "Nothing extra found" empty state over a recompute that is about to
  // return real cards — the same wrong screen this fix exists to remove.
  // Toggling `included` writes via setQueryData and triggers no refetch, so the
  // include buttons never flash this loader.
  if (sessionLoading || isLoading || isFetching) return <PageLoader />

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
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="p-5">
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

                {/* Only when the card is actually traceable. A missing control
                    means the model named no valid source — better than showing
                    a passage that might not be the one it used. */}
                {item.source_chunk_ids?.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenSourceId((prev) => (prev === item.id ? null : item.id))
                      }
                      aria-expanded={openSourceId === item.id}
                      className="flex w-full items-center gap-1.5 border-t border-slate-100 px-5 py-2.5 text-left text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                    >
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 transition-transform",
                          openSourceId === item.id && "rotate-180"
                        )}
                      />
                      {openSourceId === item.id ? "Hide" : "Show"} verbatim source
                      {item.source_chunk_ids.length > 1 &&
                        ` (${item.source_chunk_ids.length} excerpts)`}
                    </button>
                    <VerbatimSources
                      sessionId={id}
                      insightId={item.id}
                      open={openSourceId === item.id}
                      isRtl={isRtl}
                    />
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
