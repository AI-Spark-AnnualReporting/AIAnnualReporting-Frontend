"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, FileCheck, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  useAssembleReport,
  useAssemblyReadiness,
  useFinalReport,
} from "@/hooks/useReportBuilder"
import { SECTION_LAYERS } from "@/lib/constants"

interface AssembleEntryProps {
  cycleId: string
}

export function AssembleEntry({ cycleId }: AssembleEntryProps) {
  const readinessQuery = useAssemblyReadiness(cycleId)
  const finalReportQuery = useFinalReport(cycleId)
  const assemble = useAssembleReport(cycleId)
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (readinessQuery.isLoading) {
    return (
      <span className="h-10 w-44 rounded-lg bg-slate-100 animate-pulse shrink-0" />
    )
  }

  const readiness = readinessQuery.data
  if (!readiness) return null

  const { can_assemble, ready, total, incomplete_sections } = readiness

  // Use the final-report query as the source of truth for whether a report
  // exists — assembly-readiness may not return has_final_report reliably.
  const hasReport = finalReportQuery.isSuccess

  // Final report already exists → View Report only (redirect, no API call).
  // Re-assemble is available on the report page itself.
  if (hasReport) {
    return (
      <Link href={`/pm/cycles/${cycleId}/report`} className="shrink-0">
        <Button className="bg-indigo-600 text-white hover:bg-indigo-700">
          <FileCheck className="h-4 w-4 mr-1.5" />
          View Report
        </Button>
      </Link>
    )
  }

  const run = async () => {
    setConfirmOpen(false)
    try {
      await assemble.mutateAsync({})
      router.push(`/pm/cycles/${cycleId}/report`)
    } catch {
      // Error already toasted by the mutation
    }
  }

  const missing = incomplete_sections.length

  return (
    <>
      <Button
        // Assembling with empty sections is allowed — they are simply left
        // out. The confirm below is what stops that happening silently.
        onClick={() => (missing > 0 ? setConfirmOpen(true) : run())}
        disabled={!can_assemble || assemble.isPending}
        title={
          can_assemble
            ? undefined
            : "Nothing has been written yet — there is no report to assemble."
        }
        className="shrink-0 bg-indigo-600 text-white hover:bg-indigo-700"
      >
        {assemble.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            Assembling…
          </>
        ) : (
          <>
            <FileCheck className="h-4 w-4 mr-1.5" />
            Assemble Report
            {missing > 0 && (
              <span className="ml-1.5 font-normal opacity-80">
                ({ready}/{total})
              </span>
            )}
          </>
        )}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {missing} section{missing === 1 ? "" : "s"} will be left out
            </DialogTitle>
            <DialogDescription>
              Nothing has been written in {missing === 1 ? "it" : "them"} yet,
              so {missing === 1 ? "it" : "they"} won&apos;t appear in the
              report. You can assemble again after filling{" "}
              {missing === 1 ? "it" : "them"} in.
            </DialogDescription>
          </DialogHeader>

          <ul className="max-h-[240px] space-y-1 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/60 p-3">
            {incomplete_sections.map((s) => (
              <li
                key={s.section_code}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="truncate text-slate-700">{s.title}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {SECTION_LAYERS[s.layer]?.label ?? s.layer}
                </span>
              </li>
            ))}
          </ul>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Keep editing
            </Button>
            <Button
              onClick={run}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Assemble anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
