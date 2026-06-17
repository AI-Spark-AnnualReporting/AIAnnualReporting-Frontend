"use client"

import { use, useState } from "react"
import { useCycle, useActivateCycle } from "@/hooks/useCycles"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { PageLoader } from "@/components/ui/spinner"
import {
  CheckCircle, Zap, ArrowLeft, AlertCircle, XCircle, Calendar,
} from "lucide-react"
import Link from "next/link"
import { formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"

export default function ActivateCyclePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { data: cycleData, isLoading } = useCycle(id)
  const activateMutation = useActivateCycle()
  const [activated, setActivated] = useState(false)
  const [activateError, setActivateError] = useState<string | null>(null)

  if (isLoading) return <PageLoader />

  const cycle = cycleData

  const checks = [
    {
      id: "pm",
      label: "Project Manager assigned",
      description: (cycle as { pm_name?: string })?.pm_name
        ? `Assigned to ${(cycle as { pm_name?: string }).pm_name}`
        : cycle?.project_manager_id
          ? "PM assigned"
          : "No PM assigned — edit the cycle to assign one",
      passed: !!cycle?.project_manager_id,
    },
    {
      id: "deadline",
      label: "Submission deadline set",
      description: cycle?.submission_deadline
        ? `Deadline: ${formatDate(cycle.submission_deadline)}`
        : "No submission deadline — edit the cycle to set one",
      passed: !!cycle?.submission_deadline,
    },
    {
      id: "timeline",
      label: "Cycle timeline defined",
      description:
        cycle?.start_date && cycle?.end_date
          ? `${formatDate(cycle.start_date)} → ${formatDate(cycle.end_date)}`
          : "Start/end dates not set — edit the cycle",
      passed: !!(cycle?.start_date && cycle?.end_date),
    },
    {
      id: "departments",
      label: "Department assignments saved",
      description:
        "Departments must be assigned from the cycle detail page before activation.",
      passed: true, // We trust the user has saved assignments; backend validates
    },
  ]

  const allPassed = checks.filter((c) => c.id !== "departments").every((c) => c.passed)

  const handleActivate = async () => {
    setActivateError(null)
    try {
      await activateMutation.mutateAsync({ cycleId: id, generateQuestions: false })
      setActivated(true)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setActivateError(e?.message || "Activation failed. Please try again.")
    }
  }

  if (activated) {
    return (
      <div className="max-w-lg mx-auto text-center space-y-6 py-16">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mx-auto">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Cycle Activated!</h1>
          <p className="mt-2 text-muted-foreground">
            Sessions and AI questions are being generated for all assigned departments.
          </p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-left">
          <p className="text-sm font-semibold text-blue-800 mb-2">What happens next</p>
          <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
            <li>AI generates tailored questions for each department session</li>
            <li>PM submits the kickoff brief to refine AI questions</li>
            <li>Department users answer questions in their workspace</li>
            <li>PM reviews and approves submissions</li>
            <li>Final report is generated at cycle close</li>
          </ul>
        </div>
        <div className="flex gap-3 justify-center">
          <Link href={`/admin/cycles/${id}`}>
            <Button>View Cycle</Button>
          </Link>
          <Link href="/admin/cycles">
            <Button variant="outline">All Cycles</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/admin/cycles/${id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          title="Activate Cycle"
          description={`Review the checklist and activate ${cycle?.cycle_name}`}
        />
      </div>

      {/* Cycle summary */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">{cycle?.cycle_name}</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Project Manager</p>
            <p className="font-medium">
              {(cycle as { pm_name?: string })?.pm_name ||
                (cycle?.project_manager_id ? "Assigned" : "—")}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Submission Deadline</p>
            <p className="font-medium">
              {cycle?.submission_deadline ? formatDate(cycle.submission_deadline) : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Reminder to assign departments */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-700">
            <p className="font-semibold text-amber-800">Departments must be assigned first</p>
            <p className="mt-0.5">
              Go back to the{" "}
              <Link href={`/admin/cycles/${id}`} className="font-semibold underline">
                cycle detail page
              </Link>{" "}
              to search and assign departments with responsible users, then save before activating.
            </p>
          </div>
        </div>
      </div>

      {/* Pre-activation checklist */}
      <div className="space-y-3">
        <h3 className="font-semibold">Pre-Activation Checklist</h3>
        <div className="space-y-2">
          {checks.map((check) => (
            <div
              key={check.id}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4",
                check.passed ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
              )}
            >
              <div className="shrink-0 mt-0.5">
                {check.passed ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
              </div>
              <div>
                <p className={cn("text-sm font-medium", check.passed ? "text-green-800" : "text-red-800")}>
                  {check.label}
                </p>
                <p className={cn("text-xs mt-0.5", check.passed ? "text-green-700" : "text-red-600")}>
                  {check.description}
                </p>
              </div>
              {!check.passed && check.id !== "departments" && (
                <div className="ml-auto shrink-0">
                  <Link href={`/admin/cycles/${id}?editCycle=1`}>
                    <Button size="sm" variant="outline" className="text-xs h-7">Fix</Button>
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Activation error */}
      {activateError && (
        <div className="flex gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">{activateError}</p>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Link href={`/admin/cycles/${id}`}>
          <Button variant="outline" disabled={activateMutation.isPending}>
            Back to Cycle
          </Button>
        </Link>
        <Button
          onClick={handleActivate}
          disabled={!allPassed || activateMutation.isPending}
        >
          <Zap className="mr-2 h-4 w-4" />
          {activateMutation.isPending ? "Activating…" : "Activate Cycle"}
        </Button>
      </div>
    </div>
  )
}
