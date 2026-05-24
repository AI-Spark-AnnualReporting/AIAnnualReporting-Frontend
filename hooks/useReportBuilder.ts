import { useQuery } from "@tanstack/react-query"
import { pmApi } from "@/lib/api/pm"
import { QUERY_KEYS } from "@/lib/constants"

// Whether a cycle is ready to enter the Report Builder.
export function useBuildReadiness(cycleId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.BUILD_READINESS(cycleId),
    queryFn: () => pmApi.buildReadiness(cycleId),
    enabled: !!cycleId,
    staleTime: 0,
  })
}

// Resolved report sections for a cycle (PM-access).
export function usePMCycleSections(cycleId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.PM_CYCLE_SECTIONS(cycleId),
    queryFn: () => pmApi.getCycleSections(cycleId),
    enabled: !!cycleId,
    staleTime: 0,
  })
}
