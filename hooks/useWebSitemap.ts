/**
 * Queries and mutations for the "Web" screen's sitemap.
 *
 * Both mutations put the answer straight into the cache, so the screen shows
 * the new sitemap without a second request.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { readError, type MutationError } from "@/hooks/useReportBuilder"
import { webSitemapApi, type WebSitemap, type WebSitemapResponse } from "@/lib/api/webSitemap"
import { QUERY_KEYS } from "@/lib/constants"

/** The saved sitemap and the report's sections. A 422 means "not assembled yet". */
export function useWebSitemap(cycleId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.PM_CYCLE_WEB_SITEMAP(cycleId),
    queryFn: () => webSitemapApi.get(cycleId),
    enabled: !!cycleId,
    retry: false,
  })
}

/** Make a fresh AI sitemap (replaces the saved one). */
export function useCreateSitemapDraft(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => webSitemapApi.createDraft(cycleId),
    onSuccess: (data) => {
      qc.setQueryData(QUERY_KEYS.PM_CYCLE_WEB_SITEMAP(cycleId), data)
    },
    onError: (err: MutationError) => toast.error(readError(err, "Could not create the sitemap")),
  })
}

/** Save the edited sitemap. */
export function useSaveSitemap(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sitemap: WebSitemap) => webSitemapApi.save(cycleId, sitemap),
    onSuccess: (data) => {
      qc.setQueryData<WebSitemapResponse>(QUERY_KEYS.PM_CYCLE_WEB_SITEMAP(cycleId), (old) =>
        old ? { ...old, sitemap: data.sitemap } : old,
      )
      toast.success("Sitemap saved")
    },
    onError: (err: MutationError) => toast.error(readError(err, "Could not save the sitemap")),
  })
}
