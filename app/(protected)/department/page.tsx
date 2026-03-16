"use client"

import { useDepartmentDashboard } from "@/hooks/useSessions"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { Progress } from "@/components/ui/progress"
import { EmptyState } from "@/components/ui/empty-state"
import { PageSkeleton } from "@/components/ui/skeletons"
import { Button } from "@/components/ui/button"
import { ClipboardList, ArrowRight, Bell, Calendar, CheckCircle2, RotateCcw, Clock } from "lucide-react"
import Link from "next/link"
import { formatDate, cn } from "@/lib/utils"

export default function DepartmentDashboard() {
  const { data, isLoading } = useDepartmentDashboard()

  if (isLoading) return <PageSkeleton />

  const sessions = data?.assignments || []
  const notifications = data?.notifications?.filter((n) => !n.is_read) || []
  // Use the first assignment's department_name if available (most users have one dept)
  const departmentLabel =
    sessions.length > 0 ? sessions[0].department_name : "Your"

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome, ${data?.user_name || ""}!`}
        description={`${departmentLabel} Department · Annual Report Workspace`}
      />

      {/* Unread notifications */}
      {notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4"
            >
              <Bell className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-sm text-blue-800">{n.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Sessions */}
      <div>
        <h2 className="font-semibold text-lg mb-4">My Report Sessions</h2>

        {sessions.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No active sessions"
            description="You don't have any active reporting sessions. An admin will assign one when a cycle is activated."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sessions.map((session) => {
              const isApproved = session.status === "approved"
              const isReopened = session.status === "reopened"
              const isSubmittedPending = session.status === "submitted"
              const isComplete = isSubmittedPending || isApproved
              const isOverdue =
                session.submission_deadline &&
                new Date(session.submission_deadline) < new Date() &&
                !isComplete &&
                !isReopened

              return (
                <div
                  key={session.session_id}
                  className={cn(
                    "rounded-xl border bg-card p-6 space-y-4 transition-shadow hover:shadow-md",
                    isOverdue && "border-red-200",
                    isReopened && "border-amber-300 bg-amber-50/20",
                    isApproved && "border-green-200 bg-green-50/20",
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{session.cycle_name}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {session.department_name}
                      </p>
                    </div>
                    <StatusBadge status={session.status} variant="session" />
                  </div>

                  {/* Reopened notice */}
                  {isReopened && (
                    <div className="flex items-center gap-2 rounded-md bg-amber-100 border border-amber-200 px-3 py-2">
                      <RotateCcw className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      <p className="text-xs font-medium text-amber-800">
                        PM requested revisions — please update and resubmit
                      </p>
                    </div>
                  )}

                  {/* Progress */}
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{session.progress_percentage}%</span>
                    </div>
                    <Progress value={session.progress_percentage} className="h-2" />
                  </div>

                  {/* Deadline */}
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className={cn("text-muted-foreground", isOverdue && "text-red-600 font-medium")}>
                      Deadline: {formatDate(session.submission_deadline)}
                      {isOverdue && " — Overdue"}
                    </span>
                  </div>

                  {/* Action */}
                  <div className="flex gap-2 pt-1">
                    {isApproved ? (
                      <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
                        <CheckCircle2 className="h-4 w-4" />
                        Approved
                      </div>
                    ) : isSubmittedPending ? (
                      <div className="flex items-center gap-2 text-sm text-blue-600">
                        <Clock className="h-4 w-4" />
                        Submitted — Awaiting Review
                      </div>
                    ) : (
                      <Link href={`/department/sessions/${session.session_id}`} className="w-full">
                        <Button
                          className="w-full"
                          size="sm"
                          variant={isReopened ? "outline" : "default"}
                        >
                          {isReopened ? (
                            <>
                              <RotateCcw className="mr-2 h-3.5 w-3.5" />
                              Revise Submission
                            </>
                          ) : (
                            <>
                              {session.progress_percentage > 0 ? "Continue" : "Start"} Session
                              <ArrowRight className="ml-2 h-3.5 w-3.5" />
                            </>
                          )}
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
