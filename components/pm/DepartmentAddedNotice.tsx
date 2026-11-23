"use client"

import Link from "next/link"
import { ArrowRight, Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"

/** One department row from the PM cycle dashboard. */
interface DashboardDepartment {
  department_name: string
  status?: string
}

/**
 * Names of the departments that are not approved yet.
 *
 * On the Plan and Findings pages every department was approved before the PM
 * got there, so a department that isn't approved is one an admin added later.
 */
export function departmentsNotApproved(departments: DashboardDepartment[] | undefined): string[] {
  const names: string[] = []
  for (const d of departments ?? []) {
    if (d.status && d.status !== "approved") {
      names.push(d.department_name)
    }
  }
  return names
}

/** "Finance" / "Finance and Legal" / "Finance, Legal and IT". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ""
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

export function questionsHref(cycleId: string): string {
  return `/pm/cycles/${cycleId}/questions`
}

/**
 * Plan page: covers the page and explains why the PM can't continue.
 * `onGo` saves the PM's unsaved source picks, then moves them on.
 */
export function DepartmentAddedDialog({
  names,
  onGo,
  going,
}: {
  names: string[]
  onGo: () => void
  going: boolean
}) {
  const who = joinNames(names)
  const one = names.length === 1
  // The app's Radix dialog: it renders on top of everything (not inside the
  // page's scroll area), keeps keyboard focus inside, and here can't be
  // closed with Escape or an outside click — the button is the only way on.
  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        hideClose
        className="gap-0 rounded-2xl p-7"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
          <Plus className="h-5 w-5" />
        </span>
        <DialogTitle className="mt-4 text-xl font-extrabold leading-snug text-slate-900">
          {who} {one ? "was" : "were"} added to this report
        </DialogTitle>
        <DialogDescription className="mt-2 text-[15px] leading-relaxed text-slate-600">
          An admin added {who} after you started the plan. You can&apos;t continue here until{" "}
          {one ? "its" : "their"} questions are generated, answered and approved.
        </DialogDescription>

        <ul className="mt-5 space-y-2.5 rounded-xl border border-slate-200 px-4 py-3.5 text-sm text-slate-700">
          <li className="flex gap-2.5">
            <span className="font-extrabold text-emerald-700">✓</span>
            <span>
              <b>Your work is kept.</b> Your sections and suggested themes stay exactly as they are.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="font-extrabold text-indigo-700">1</span>
            <span>Generate questions for {who}.</span>
          </li>
          <li className="flex gap-2.5">
            <span className="font-extrabold text-indigo-700">2</span>
            <span>The Lead reviews them, the team answers, the Lead approves.</span>
          </li>
          <li className="flex gap-2.5">
            <span className="font-extrabold text-indigo-700">3</span>
            <span>
              Come back here and add {who} as a source to the sections {one ? "it" : "they"} should feed.
            </span>
          </li>
        </ul>

        <div className="mt-6 flex justify-end">
          <Button onClick={onGo} disabled={going}>
            {going && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Go to Generated Questions
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Findings page: a notice above the findings, the page stays usable. */
export function DepartmentAddedBanner({
  cycleId,
  names,
  approved,
  total,
  hasFindings,
}: {
  cycleId: string
  names: string[]
  approved: number | undefined
  total: number | undefined
  /** "Your handled findings are kept" only makes sense when there are some. */
  hasFindings: boolean
}) {
  const who = joinNames(names)
  const one = names.length === 1
  const count = approved !== undefined && total !== undefined ? ` (${approved} of ${total} approved)` : ""
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4">
      <div className="flex min-w-0 flex-1 basis-72 items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
          <Plus className="h-4 w-4" />
        </span>
        <p className="text-sm leading-relaxed text-amber-900">
          <b>
            {who} {one ? "was" : "were"} added after kickoff.
          </b>
          <br />
          Analyze and Open Report Builder wait until {who} {one ? "is" : "are"} approved{count}.
          {hasFindings && " Your handled findings are kept."}
        </p>
      </div>
      <Link href={questionsHref(cycleId)}>
        <Button variant="outline">
          Go to Generated Questions
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </Link>
    </div>
  )
}
