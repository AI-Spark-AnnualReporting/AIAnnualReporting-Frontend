"use client"

import { usePMReviewQueue } from "@/hooks/useSessions"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { PageSkeleton } from "@/components/ui/skeletons"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { Progress } from "@/components/ui/progress"
import { ClipboardCheck, ArrowRight } from "lucide-react"
import Link from "next/link"
import { formatDateTime } from "@/lib/utils"

export default function PMReviewsPage() {
  const { data, isLoading } = usePMReviewQueue()

  if (isLoading) return <PageSkeleton />

  const submissions = data ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pending Reviews"
        description="Department submissions awaiting your review"
        action={
          submissions.length > 0 ? (
            <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 text-xs font-medium px-2.5 py-1">
              {submissions.length} pending
            </span>
          ) : undefined
        }
      />

      {submissions.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="All caught up!"
          description="There are no submissions pending your review right now."
        />
      ) : (
        <div className="rounded-lg border bg-card divide-y">
          {submissions.map((sub) => (
            <div
              key={sub.session_id}
              className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-muted/30 transition-colors"
            >
              <div className="min-w-0 space-y-1">
                <p className="font-medium truncate">{sub.department_name}</p>
                <p className="text-sm text-muted-foreground truncate">
                  {sub.cycle_name} · Submitted by {sub.user_name}
                </p>
                {sub.submitted_at && (
                  <p className="text-xs text-muted-foreground">
                    Submitted {formatDateTime(sub.submitted_at)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="hidden sm:flex items-center gap-2 w-32">
                  <Progress value={sub.progress_percentage} className="h-1.5" />
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {sub.progress_percentage}%
                  </span>
                </div>
                <StatusBadge status={sub.status} variant="session" />
                <Link href={`/pm/sessions/${sub.session_id}`}>
                  <Button size="sm">
                    Review <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
