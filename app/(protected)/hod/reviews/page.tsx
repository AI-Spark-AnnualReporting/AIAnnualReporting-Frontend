"use client"

import Link from "next/link"
import { useHODSessions } from "@/hooks/useHod"
import { EmptyState } from "@/components/ui/empty-state"
import { PageLoader } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { ClipboardCheck, ArrowRight, Users } from "lucide-react"

// HOD reviews/approves the department user's submitted answers (status `submitted`).
export default function HODReviewsPage() {
  const { data: sessions, isLoading } = useHODSessions("submitted")
  if (isLoading) return <PageLoader />
  const list = sessions || []

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Review Answers</h1>
        <p className="mt-1.5 text-base text-slate-500">
          Submitted answers from your team, waiting for your approval.
        </p>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Nothing to review yet"
          description="When a team member submits their answers, they’ll show up here for you to approve or send back."
        />
      ) : (
        <div className="space-y-4">
          {list.map((s) => (
            <div
              key={s.session_id}
              className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-[11px] font-extrabold tracking-wide text-white">
                    {s.departments?.department_code || "DEPT"}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-slate-900">
                      {s.reporting_cycles?.cycle_name || "Reporting cycle"}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-slate-500">
                      <Users className="h-3.5 w-3.5 shrink-0" />
                      {s.users?.full_name ? `Submitted by ${s.users.full_name}` : "Submitted"}
                      {s.departments?.department_name ? ` · ${s.departments.department_name}` : ""}
                    </p>
                  </div>
                </div>
                <Link href={`/hod/sessions/${s.session_id}/review`} className="shrink-0">
                  <Button className="bg-indigo-600 text-white hover:bg-indigo-700">
                    Review answers <ArrowRight className="ml-1.5 h-4 w-4" />
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
