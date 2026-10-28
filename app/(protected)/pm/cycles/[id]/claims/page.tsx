"use client"

import { use, useState } from "react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, ArrowLeft, ChevronDown, Loader2, ScanSearch, ListTree } from "lucide-react"

import { FACTS_SHORT_AT, useDepartmentClaims, useExtractDepartmentClaims } from "@/hooks/useReportBuilder"
import { useRetryClaimExtraction } from "@/hooks/useNotifications"
import { QUERY_KEYS } from "@/lib/constants"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { PageHeader } from "@/components/ui/page-header"
import { PageLoader } from "@/components/ui/spinner"
import { EmptyState } from "@/components/ui/empty-state"
import { Button } from "@/components/ui/button"
import type { DepartmentClaimsGroup } from "@/lib/api/pm"
import { ClaimLine } from "@/components/report/ClaimLine"
import { cn } from "@/lib/utils"

/* What each approved department stated, read out of its ANSWERS — never its
   draft, which is AI-written from those same answers. The PM reads this to see
   every figure in the cycle in one place, and it is the source the pre-build
   draft checks compare against.

   Read-only by design: a claim is derived from an answer, so editing one would
   change nothing in the report. The report changes by editing a draft sentence,
   which is what the findings panel on the cycle page does. */
export default function CycleClaimsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, isLoading } = useDepartmentClaims(id)
  const { data: dash } = usePMCycleDashboard(id)
  const extract = useExtractDepartmentClaims(id)
  const [openId, setOpenId] = useState<string | null>(null)

  if (isLoading) return <PageLoader />

  const departments = data?.departments ?? []
  const cycleName =
    (dash as { cycle?: { cycle_name?: string } } | undefined)?.cycle?.cycle_name ??
    "This cycle"
  // Nothing has been read yet — either no department is approved, or every
  // extraction failed. Either way the PM's route forward is the same button.
  const nothingRead = departments.every((d) => !d.extracted_at)
  // Departments still waiting on a read. Normally none: the read happens when
  // the HOD approves. A department that found no facts counts as read, so this
  // stays at zero rather than offering to re-read it forever.
  const unreadCount = departments.filter((d) => !d.extracted_at).length

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
          title="Department Claims"
          description={`${cycleName} — what each department stated, taken from their answers`}
          action={
            // Only when there is something to read. Once every department has
            // been read the button has no work to do, and a permanent "Read
            // missing" invites a pointless round of model calls.
            unreadCount > 0 && (
              <Button
                variant="outline"
                onClick={() => extract.mutate()}
                disabled={extract.isPending}
              >
                {extract.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ScanSearch className="mr-2 h-4 w-4" />
                )}
                {extract.isPending
                  ? "Reading…"
                  : nothingRead
                    ? "Extract claims"
                    : `Read ${unreadCount} missing`}
              </Button>
            )
          }
        />
      </div>

      {departments.length === 0 ? (
        <EmptyState
          icon={ListTree}
          title="No approved departments yet"
          description="A department's claims are read from its answers once its Department Lead approves the submission."
        />
      ) : nothingRead ? (
        <EmptyState
          icon={ListTree}
          title="Nothing read yet"
          description="Claims are normally read automatically when a Department Lead approves. Use Extract claims to read them now."
        />
      ) : (
        <div className="space-y-3">
          {departments.map((dept) => (
            <DepartmentClaims
              key={dept.session_id}
              cycleId={id}
              dept={dept}
              open={openId === dept.session_id}
              onToggle={() =>
                setOpenId((prev) => (prev === dept.session_id ? null : dept.session_id))
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DepartmentClaims({
  cycleId,
  dept,
  open,
  onToggle,
}: {
  cycleId: string
  dept: DepartmentClaimsGroup
  open: boolean
  onToggle: () => void
}) {
  const count = dept.claims.length
  // extracted_at is stamped whenever the read runs, including when it finds
  // nothing — so a department with no facts reads differently from one nobody
  // has looked at.
  const wasRead = !!dept.extracted_at
  // Figures the answers state that no fact carries: the list came out short,
  // and the draft check would flag those sentences as unsupported.
  const counted = wasRead ? (dept.figures_not_in_facts ?? 0) : 0
  // Warned once: after a re-read nothing more is shown, so re-reading can
  // never become a loop (the draft check allows for what is left).
  const missing = !dept.facts_reread && counted >= FACTS_SHORT_AT ? counted : 0
  const qc = useQueryClient()
  const reread = useRetryClaimExtraction()
  const readAgain = () =>
    reread.mutate(dept.session_id, {
      onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.DEPARTMENT_CLAIMS(cycleId) }),
    })

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#1A1D2E]">{dept.department}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {count > 0
              ? `${count} fact${count === 1 ? "" : "s"}`
              : wasRead
                ? "No facts found"
                : "Not read yet"}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {missing > 0 && (
        <div className="mx-5 mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="flex items-center gap-2 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {missing} figure{missing === 1 ? "" : "s"} in the answers {missing === 1 ? "isn't" : "aren't"} in any fact.
          </p>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={readAgain} disabled={reread.isPending}>
            {reread.isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
            {reread.isPending ? "Reading…" : "Read the facts again"}
          </Button>
        </div>
      )}

      {open && (
        <div className="border-t border-slate-100 px-5 py-4">
          {count === 0 ? (
            <p className="text-sm text-slate-400">
              {wasRead
                ? "This department's answers don't state any facts — they were left blank, or describe what should be reported rather than what happened."
                : "This department's answers haven't been read yet."}
            </p>
          ) : (
            <div className="space-y-4">
              {dept.claims.map((claim) => (
                <ClaimLine key={claim.id} claim={claim} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
