"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { FileCheck, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

  if (readinessQuery.isLoading) {
    return (
      <span className="h-8 w-40 rounded-md bg-muted/60 animate-pulse shrink-0" />
    )
  }

  const readiness = readinessQuery.data
  if (!readiness) return null

  // Backend's assembly_readiness now correctly excludes auto-mode sections
  // from the lock requirement (Stage 6 spec §11 — shipped). Read its values
  // directly; no client-side massaging needed.
  const {
    can_assemble,
    locked,
    total,
    unlocked_sections,
  } = readiness

  // Use the final-report query as the source of truth for whether a report
  // exists — assembly-readiness may not return has_final_report reliably.
  const hasReport = finalReportQuery.isSuccess

  // Final report already exists → View Report only (redirect, no API call).
  // Re-assemble is available on the report page itself.
  if (hasReport) {
    return (
      <Link href={`/pm/cycles/${cycleId}/report`} className="shrink-0">
        <Button size="sm" className="h-8">
          <FileCheck className="h-3.5 w-3.5 mr-1.5" />
          View Report
        </Button>
      </Link>
    )
  }

  // Ready, no final report yet → primary Assemble button.
  if (can_assemble) {
    const onAssemble = async () => {
      try {
        await assemble.mutateAsync({})
        router.push(`/pm/cycles/${cycleId}/report`)
      } catch {
        // Error already toasted by the mutation
      }
    }
    return (
      <Button
        size="sm"
        onClick={onAssemble}
        disabled={assemble.isPending}
        className="h-8 shrink-0"
      >
        {assemble.isPending ? (
          <>
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            Assembling…
          </>
        ) : (
          <>
            <FileCheck className="h-3.5 w-3.5 mr-1.5" />
            Assemble Report
          </>
        )}
      </Button>
    )
  }

  // Not ready → disabled-style button with a popover listing what's left.
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 cursor-help"
        >
          <FileCheck className="h-3.5 w-3.5 mr-1.5" />
          Assemble Report ({locked}/{total})
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[260px]">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Lock the remaining sections to assemble:
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {unlocked_sections.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-muted-foreground">
            All sections locked — refresh to enable.
          </div>
        ) : (
          <ul className="py-1 max-h-[280px] overflow-y-auto">
            {unlocked_sections.map((s) => {
              const layer = SECTION_LAYERS[s.layer]
              return (
                <li
                  key={s.section_code}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm"
                >
                  <span className="truncate">{s.title}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {layer?.label ?? s.layer}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
