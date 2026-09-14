import { centriyonUrl } from "@/lib/centriyon"
import { isClosed } from "@/lib/report-status"
import type { ReportGeneration } from "@/lib/api/communications"

/* Where a thread's report card sends the reader.

   The API returns ids and a `kind`, never a URL — it has no view of anyone's
   routes — so each app owns its own mapping. Here that split is real: annual
   cycles are built in THIS app, while quarterly, board, earnings and ESG live
   in Centriyon, so those are absolute cross-app links. */

type Generation = Pick<ReportGeneration, "state" | "target"> & { done?: number | null }
type Target = ReportGeneration["target"]

// Cycle pages are role-prefixed (/pm/cycles/…, /admin/cycles/…); admins run
// them from their own section. Anyone else follows the PM route, which is the
// one the report screens themselves link to.
function cyclePath(cycleId: string, role?: string | null): string {
  return `${role === "admin" ? "/admin" : "/pm"}/cycles/${cycleId}`
}

/**
 * Link for a report card's target, or null when there is nowhere to go — an IR
 * briefing has no module, a malformed target should not navigate, and a
 * Centriyon link is impossible without NEXT_PUBLIC_CENTRITON_URL.
 *
 * `role` picks the cycle route; `token` rides along on a cross-app link so the
 * user lands signed in on the page itself rather than on Centriyon's login.
 * Both are ignored where they don't apply.
 */
/** This page's absolute URL, for a link that leaves the app to point back at.

    Cross-app links land on a different website, and nothing travels between two
    origins on its own — the return address has to be written into the link. */
export function currentPageUrl(): string | null {
  if (typeof window === "undefined") return null
  return window.location.href
}

export function generationHref(
  generation: Generation,
  { role, token, backTo }: { role?: string | null; token?: string | null; backTo?: string | null } = {},
): string | null {
  const { state, target } = generation
  if (!target?.kind) return null
  // Which page of a module: a report that is ready opens at its assembled /
  // preview page, and one still being written opens where the work is. Sending
  // an unwritten report to its preview lands on an empty document.
  const ready = state === "ready"
  const centriyon = (path: string) =>
    centriyonUrl(token, backTo ? `${path}?back=${encodeURIComponent(backTo)}` : path)
  switch (target.kind) {
    // cycle_id, NOT report_id — an annual report row is a shell pointing at a
    // cycle, and the report id lands on an empty page. One page either way: the
    // cycle screen is both where it's written and where it's read.
    case "annual_cycle":
      return target.cycle_id ? cyclePath(target.cycle_id, role) : null
    // Preview is the page that shows whatever has been produced so far — the
    // right landing spot for a report still being worked on. An approved
    // quarterly gets its assembled document instead; the other two lanes
    // preview and read on the same page.
    case "quarterly_report":
      return target.report_id
        ? centriyon(`/quarterly-report/${target.report_id}/${ready ? "report" : "preview"}`)
        : null
    case "board_report":
      return target.report_id ? centriyon(`/board-report/${target.report_id}/preview`) : null
    case "earnings_report":
      return target.report_id ? centriyon(`/earnings/${target.report_id}/preview`) : null
    // ESG has no sections to preview — its coverage page IS the report, and
    // there is one per report (FY-2024 GRI, FY-2023 GRI…), not one per company.
    case "esg_page":
      return centriyon(target.report_id ? `/reports/${target.report_id}` : "/reports")
    default:
      return null
  }
}

/** Whether the thread's controls should leave for the report's own page.

    Until a report is approved there is nothing settled to read in the review
    screen — the module's preview page is where the work actually shows. ESG
    always goes to its own page: it keeps no sections to render here at all.

    Annual never leaves. The Hub renders a cycle's sections itself (see
    reviewAnnualSections), and the cycle page is PM/admin-only in this app — a
    reviewer sent there is bounced straight back to their dashboard, which is
    exactly what "shared it, they can't open it" looked like. When an annual
    report is not readable here at all, hasSomethingToReview has already made
    the card inert and no href is asked for. */
export function opensModulePage(generation: Generation): boolean {
  if (generation.target.kind === "annual_cycle") return false
  return generation.state !== "ready" || generation.target.kind === "esg_page"
}

/** Whether this thread's controls should offer the report at all.

    The question is "has anything been written yet", not "is it approved". A
    cycle mid-draft is not a report to read, and the review screen would be
    empty headings — that is the case worth hiding.

    Annual is the only lane that reports a section count, so it is the only one
    this can answer false for. It used to be gated on approval alone, from when
    annual reports were never reviewed here. Now they are: sharing one for
    review is precisely what puts it in front of a reader, and gating on
    approval hid the report from the very reviewer it had just been sent to.

    So the test is simply whether any section has been written: `done > 0`. A
    cycle with nothing written reports 0 and stays inert, which is the case the
    old rule was really guarding.

    Neither of the obvious alternatives works here:
      - `state === "ready"` — `auto` sections (the cover, the contents page)
        cannot be locked by design, yet they count toward the cycle's total, so
        a fully assembled report still reads as e.g. 9/11 and only reaches
        "ready" by being approved.
      - `isClosed(status)` — the old rule. Sharing for review sets the status to
        in_review, and a send-back sets it back to draft, so this hid the report
        from the reviewer it had just been sent to, and then hid the reviewer's
        own comments from the author it was sent back to.

    Every other type reports no count and is always offerable: approval is their
    readiness gate, so "not approved" there is the normal state of a report that
    is out for review right now. */
export function hasSomethingToReview(
  generation?: Generation | null,
  status?: string | null,
): boolean {
  if (!generation || generation.done == null) return true
  return generation.done > 0 || isClosed(status)
}
