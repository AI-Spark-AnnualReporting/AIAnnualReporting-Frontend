/**
 * The "Web" screen's API: the sitemap of a report's microsite.
 *
 * Three calls: read the sitemap (with the report's current sections), make a
 * fresh AI draft, save the PM's edits. Stored on the cycle at
 * report_design.web_sitemap; nothing renders it yet.
 */
import { apiClient } from "./client"

/** One web page. Two or more section codes = several sections on one page. */
export interface WebSitemapPage {
  id: string
  title: string
  section_codes: string[]
  hidden: boolean
}

/** One menu group, like "Purpose & Path". */
export interface WebSitemapGroup {
  id: string
  title: string
  pages: WebSitemapPage[]
}

export interface WebSitemap {
  version?: number
  generated_at?: string | null
  home: { title: string }
  groups: WebSitemapGroup[]
}

/** A report section, as the sitemap refers to it. */
export interface WebSection {
  section_code: string
  title: string
}

export interface WebSitemapResponse {
  sitemap: WebSitemap | null
  sections: WebSection[]
}

function sitemapUrl(cycleId: string): string {
  return `/pm/cycles/${encodeURIComponent(cycleId)}/web-sitemap`
}

export const webSitemapApi = {
  /** The saved sitemap (null before the first draft) and the report's sections. */
  get: async (cycleId: string): Promise<WebSitemapResponse> => {
    const { data } = await apiClient.get(sitemapUrl(cycleId))
    return data
  },

  /** Group the sections with the AI and save the result. Replaces any saved sitemap. */
  createDraft: async (cycleId: string): Promise<WebSitemapResponse> => {
    const { data } = await apiClient.post(`${sitemapUrl(cycleId)}/draft`, null, {
      timeout: 120000,
    })
    return data
  },

  /** Save the edited sitemap. */
  save: async (cycleId: string, sitemap: WebSitemap): Promise<{ sitemap: WebSitemap }> => {
    const { data } = await apiClient.put(sitemapUrl(cycleId), { sitemap })
    return data
  },
}
