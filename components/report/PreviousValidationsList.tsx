"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeletons"
import { useExternalValidations } from "@/hooks/useReportBuilder"
import { formatDateTime } from "@/lib/utils"

const ROW_CLASS = "flex items-center justify-between gap-3 rounded-xl border bg-white p-3 text-sm"

/* "Previous validations", above the Annual Report Validator form. Each row
   opens the same run page a fresh validation lands on (/runs/[jobId]) -
   that page already polls a running job and renders a finished one, so a
   past run needs no special handling here, just a link. */
export function PreviousValidationsList() {
  const { data: jobs, isLoading } = useExternalValidations()

  // Nothing to show only once loading is actually done - while it's still
  // running there's no way yet to tell "empty" from "has rows".
  if (!isLoading && (!jobs || jobs.length === 0)) return null

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Previous validations
      </p>
      <div className="space-y-2">
        {isLoading
          ? [0, 1].map((i) => (
              <div key={i} className={ROW_CLASS}>
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))
          : jobs!.map((job) => (
              <Link
                key={job.job_id}
                href={`/pm/annual-report-validator/runs/${job.job_id}`}
                className={`${ROW_CLASS} transition-colors hover:border-slate-300`}
              >
                <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
                  {job.filename}
                </span>
                {job.status === "completed" && job.score != null && (
                  <Badge variant="secondary">{job.score}/100</Badge>
                )}
                {job.status === "failed" && <Badge variant="destructive">Failed</Badge>}
                {job.status === "running" && <Badge variant="outline">Validating…</Badge>}
                <span className="shrink-0 text-xs text-slate-400">
                  {formatDateTime(job.created_at)}
                </span>
              </Link>
            ))}
      </div>
    </div>
  )
}
