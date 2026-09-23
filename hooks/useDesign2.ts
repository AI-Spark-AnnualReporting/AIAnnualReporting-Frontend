/**
 * Queries and mutations for the page designer.
 *
 * The one thing worth noticing: saving a template choice patches the cache in
 * place rather than invalidating it. The cycle payload carries every section's
 * blocks and is large; refetching it after each card click would visibly
 * flicker the rail for no new information, since the response already contains
 * the updated envelope.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { design2Api, type CycleDesign, type DesignEnvelope } from "@/lib/api/design2"
import { QUERY_KEYS } from "@/lib/constants"
import { readError, type MutationError } from "@/hooks/useReportBuilder"

export function useCycleDesign(cycleId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.PM_CYCLE_DESIGN2(cycleId),
    queryFn: () => design2Api.get(cycleId),
    enabled: !!cycleId,
    staleTime: 0,
  })
}

function patchSection(
  qc: ReturnType<typeof useQueryClient>,
  cycleId: string,
  sectionCode: string,
  design: DesignEnvelope,
) {
  qc.setQueryData<CycleDesign>(QUERY_KEYS.PM_CYCLE_DESIGN2(cycleId), (old) => {
    if (!old) return old
    const sections = old.sections.map((s) =>
      s.section_code === sectionCode
        ? { ...s, design, extracted: true, stale: false }
        : s,
    )
    // Recount rather than trust a delta: a re-extract can change how many
    // pages a section even has.
    let unitsTotal = 0
    let unitsChosen = 0
    for (const s of sections) {
      for (const u of s.design?.units ?? []) {
        unitsTotal += 1
        if (u.template_key) unitsChosen += 1
      }
    }
    return { ...old, sections, units_total: unitsTotal, units_chosen: unitsChosen }
  })
}

export function useSetTemplate(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      sectionCode,
      unitIndex,
      templateKey,
    }: {
      sectionCode: string
      unitIndex: number
      templateKey: string | null
    }) => design2Api.setTemplate(cycleId, sectionCode, unitIndex, templateKey),
    onSuccess: (res) => patchSection(qc, cycleId, res.section_code, res.design),
    onError: (err: MutationError) =>
      toast.error(readError(err, "Could not save that template choice")),
  })
}

export function useExtractSection(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionCode, force }: { sectionCode: string; force?: boolean }) =>
      design2Api.extract(cycleId, sectionCode, force ?? false),
    onSuccess: (res) => patchSection(qc, cycleId, res.section_code, res.design),
    onError: (err: MutationError) =>
      toast.error(readError(err, "Could not structure that section")),
  })
}
