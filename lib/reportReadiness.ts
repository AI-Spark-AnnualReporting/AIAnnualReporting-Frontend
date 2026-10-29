/**
 * reportReadiness.ts — recognising a "report isn't ready for the AI assistant"
 * notification, and working out which report it is about.
 *
 * When Centriton approves a quarterly or earnings report it indexes the report
 * so the AI assistant can answer questions about it. If that fails, it writes a
 * notification row for the approver — into the `notifications` table this app
 * SHARES with it. So those rows arrive in this app's bell too, and the bell can
 * offer to fix the problem in place.
 *
 * The two rules below live here rather than inside the bell component for one
 * practical reason: this file can be run by `node`, and a .tsx component cannot.
 * The rest of this repo's self-checks work the same way.
 */

/** notification_type on a readiness row. One of the backend's NotificationType values. */
export const READINESS_TYPE = "alert"

/** related_type on a readiness row. related_id is then the report's id. */
export const READINESS_RELATED_TYPE = "report"

export type ReportKind = "earnings" | "quarterly"

/**
 * Is this row a report-readiness warning?
 *
 * Deliberately NOT keyed on `category`, even though Centriton writes one
 * (`report_ai_readiness`): this backend's NotificationResponse does not return
 * that column, so a reader never sees it.
 *
 * Both halves are needed. `notification_type === "alert"` alone is too loose —
 * it is a general-purpose value any future alert could use — and matching
 * loosely would put a "Try again" button on rows that have nothing to retry.
 *
 * Keep in step with TYPE_REPORT_AI_READINESS / RELATED_TYPE_REPORT in
 * Centriton's notifications.py, and with NotificationBell.tsx in
 * Centrion_Frontend.
 */
export function isReadinessNotification(
  n: { notification_type?: string; related_type?: string | null },
): boolean {
  return n.notification_type === READINESS_TYPE && n.related_type === READINESS_RELATED_TYPE
}

/**
 * Which report a readiness row is about, read off its deep link.
 *
 * The two kinds are retried through different endpoints — earnings by report id
 * alone, quarterly by company AND report — so this decides which call to make.
 * `action_url` is a Centriton frontend route; it is never navigated to from
 * here (it would 404), only parsed.
 *
 * Returns null when the link is missing or unrecognised, which the caller
 * renders as a row with no button rather than guessing an endpoint.
 */
export function reportKind(actionUrl?: string | null): ReportKind | null {
  if (!actionUrl) return null
  if (actionUrl.startsWith("/earnings/")) return "earnings"
  if (actionUrl.startsWith("/quarterly-report/")) return "quarterly"
  return null
}

/**
 * Strip the API prefix off a poll_url before handing it to the Centriton client.
 *
 * The backend returns "/api/v1/agent_runs/{id}", and the client's baseURL
 * already ends in /api/v1 — passing it through raw requests
 * /api/v1/api/v1/agent_runs/{id}. Centriton's own client strips the same prefix
 * for the same reason.
 */
export function agentRunPath(pollUrl: string): string {
  return pollUrl.replace(/^\/api\/v1/, "")
}
