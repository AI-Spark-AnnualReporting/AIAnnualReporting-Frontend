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

import {
  createDesignApi, type CustomPaper, type CycleDesign, type DesignEnvelope,
} from "@/lib/api/createDesign"
import { QUERY_KEYS } from "@/lib/constants"
import type { Orientation } from "@/lib/orientation"
import { readError, type MutationError } from "@/hooks/useReportBuilder"

export function useCycleDesign(cycleId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.PM_CYCLE_CREATE_DESIGN(cycleId),
    queryFn: () => createDesignApi.get(cycleId),
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
  qc.setQueryData<CycleDesign>(QUERY_KEYS.PM_CYCLE_CREATE_DESIGN(cycleId), (old) => {
    if (!old) return old
    const sections = old.sections.map((s) =>
      s.section_code === sectionCode
        ? { ...s, design, extracted: true, stale: false }
        : s,
    )
    // Recount rather than trust a delta: a re-extract can change how many
    // pages a section even has.
    //
    // Portrait picks only, as the backend counts them. Landscape counts are
    // worked out on screen with countPicked() from lib/orientation.
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

/**
 * Save one page's template pick. `orientation` (default portrait) says which
 * of the page's two picks it is.
 */
export function useSetTemplate(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      sectionCode,
      unitIndex,
      templateKey,
      orientation,
    }: {
      sectionCode: string
      unitIndex: number
      templateKey: string | null
      orientation?: Orientation
    }) =>
      createDesignApi.setTemplate(
        cycleId,
        sectionCode,
        unitIndex,
        templateKey,
        orientation ?? "portrait",
      ),
    onSuccess: (res) => patchSection(qc, cycleId, res.section_code, res.design),
    onError: (err: MutationError) =>
      toast.error(readError(err, "Could not save that template choice")),
  })
}

/**
 * "Use for all sections" in landscape: fill every page with no landscape pick.
 *
 * The answer carries every section it changed, so each one is patched into
 * the cache in place — the same no-refetch reasoning as a single pick, above.
 */
export function useApplyLandscapeToAll(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ templateKey }: { templateKey: string }) =>
      createDesignApi.applyLandscapeToAll(cycleId, templateKey),
    onSuccess: (res) => {
      for (const [sectionCode, design] of Object.entries(res.sections)) {
        patchSection(qc, cycleId, sectionCode, design)
      }
    },
    onError: (err: MutationError) =>
      toast.error(readError(err, "Could not apply that template to every section")),
  })
}

/**
 * Check a section's saved custom template against its current content (one
 * render, no AI). A pass clears the "may no longer fit" note; a fail leaves
 * the template where it is and says what the check found.
 */
export function useRecheckCustomTemplate(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionCode, paper }: { sectionCode: string; paper: CustomPaper }) =>
      createDesignApi.recheckCustomTemplate(cycleId, sectionCode, paper),
    onSuccess: (res, vars) => {
      patchSection(qc, cycleId, vars.sectionCode, res.design)
      if (res.ok) {
        toast.success("The custom template still fits this section")
      } else {
        toast.error(
          `The custom template no longer fits: ${res.problems[0]?.message ?? "the check failed"}. ` +
            "Make a new one, or pick another template.",
        )
      }
    },
    onError: (err: MutationError) =>
      toast.error(readError(err, "Could not check the custom template")),
  })
}

export function useExtractSection(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionCode, force }: { sectionCode: string; force?: boolean }) =>
      createDesignApi.extract(cycleId, sectionCode, force ?? false),
    onSuccess: (res) => patchSection(qc, cycleId, res.section_code, res.design),
    onError: (err: MutationError) =>
      toast.error(readError(err, "Could not structure that section")),
  })
}
