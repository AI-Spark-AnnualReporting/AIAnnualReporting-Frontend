"use client"

import { use, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ChevronDown, Loader2, ScanSearch, ListTree } from "lucide-react"

import { useDepartmentClaims, useExtractDepartmentClaims } from "@/hooks/useReportBuilder"
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
              dept={dept}
              checked={!!data?.findings_checked_at}
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
  dept,
  open,
  onToggle,
  checked,
}: {
  dept: DepartmentClaimsGroup
  open: boolean
  onToggle: () => void
  /** Whether the drafts have been analyzed, so a clean fact can be called clean. */
  checked: boolean
}) {
  const count = dept.claims.length
  // extracted_at is stamped whenever the read runs, including when it finds
  // nothing — so a department with no facts reads differently from one nobody
  // has looked at.
  const wasRead = !!dept.extracted_at

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
                <ClaimLine key={claim.id} claim={claim} checked={checked} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
