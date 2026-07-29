"use client"

import { use, useState } from "react"
import Link from "next/link"
import { usePMCycleDashboard, usePMSession } from "@/hooks/useSessions"
import { PageHeader } from "@/components/ui/page-header"
import { PageLoader, Spinner } from "@/components/ui/spinner"
import { EmptyState } from "@/components/ui/empty-state"
import { Button } from "@/components/ui/button"
import { SessionSummary } from "@/types"
import { cn } from "@/lib/utils"
import { ArrowLeft, ChevronDown, ListChecks, Sparkles } from "lucide-react"

/* The AI-generated question set for every department in a cycle, read-only for
   the PM. Questions are generated at kickoff but until now were only visible to
   the department/HOD — this is the PM's view of what was asked. */
export default function CycleQuestionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, isLoading } = usePMCycleDashboard(id)
  const [openId, setOpenId] = useState<string | null>(null)

  if (isLoading) return <PageLoader />

  const dash = data as { cycle?: { cycle_name?: string }; departments?: SessionSummary[] } | undefined
  const departments = dash?.departments ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Link href={`/pm/cycles/${id}`}>
          <Button variant="outline" size="icon" className="mt-0.5 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          className="flex-1"
          title="Generated Questions"
          description={`${dash?.cycle?.cycle_name ?? "This cycle"} — the AI-generated question set each department was asked to answer`}
        />
      </div>

      {departments.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No departments yet"
          description="Questions are generated for every department when the kickoff brief is approved."
        />
      ) : (
        <div className="space-y-3">
          {departments.map((d) => (
            <DepartmentQuestions
              key={d.session_id}
              dept={d}
              open={openId === d.session_id}
              onToggle={() => setOpenId((prev) => (prev === d.session_id ? null : d.session_id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* One collapsible department card. The question list is fetched only once the
   card is expanded — passing "" disables the query (see usePMSession). */
function DepartmentQuestions({
  dept,
  open,
  onToggle,
}: {
  dept: SessionSummary
  open: boolean
  onToggle: () => void
}) {
  const { data, isLoading, error } = usePMSession(open ? dept.session_id : "")
  const questions = [...(data?.session?.questions ?? [])].sort(
    (a, b) => (a.order || 0) - (b.order || 0),
  )

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border bg-card transition-colors",
        open ? "border-indigo-200 shadow-sm" : "hover:border-indigo-200",
      )}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-indigo-50/40"
      >
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
            open ? "bg-indigo-600 text-white" : "bg-indigo-100 text-indigo-600",
          )}
        >
          <ListChecks className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{dept.department_name}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{dept.department_code}</p>
        </div>
        {/* Count is only known once expanded — the list is fetched lazily. */}
        {open && questions.length > 0 && (
          <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
            {questions.length} questions
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="border-t bg-muted/20 px-5 py-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4" /> Loading questions…
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">
              Couldn&apos;t load this department&apos;s questions.
            </p>
          ) : questions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No questions have been generated for this department yet.
            </p>
          ) : (
            <ol className="space-y-2.5">
              {questions.map((q, i) => (
                <li
                  key={q.question_id}
                  className="flex gap-3 rounded-xl border border-indigo-100 bg-white px-4 py-3 text-sm leading-relaxed"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-xs font-semibold text-indigo-600">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">{q.question}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}
