import type { BuildReadiness } from "@/types"

/* Where "Open Report Builder" takes the PM, picked from the server's
   build-readiness facts. One rule, used by both buttons (cycle page and
   findings page), so they can never disagree.

   Checked in this order:
   1. A report is assembled      -> the final report screen.
   2. The plan is locked         -> the builder.
   3. Otherwise                  -> the plan screen.

   "Assembled", not "approved", decides the final screen: the approval row is
   shared between sibling cycles of the same year, so approval alone can be
   true for a cycle that never assembled anything. Every approved report is
   also assembled, so approval only changes the label. */

export type ReportBuilderScreen = "report" | "build" | "plan"

export interface ReportBuilderDestination {
  screen: ReportBuilderScreen
  href: string
  label: string
  /** The PM still has to pass the draft findings page before going in. */
  needsFindingsStep: boolean
}

type DestinationFacts = Pick<
  BuildReadiness,
  "plan_locked" | "findings_locked" | "report_assembled" | "report_approved"
>

/** Pick the screen "Open Report Builder" should open for this cycle. */
export function pickReportBuilderDestination(
  cycleId: string,
  readiness: DestinationFacts,
): ReportBuilderDestination {
  const base = `/pm/cycles/${cycleId}`

  if (readiness.report_assembled) {
    return {
      screen: "report",
      href: `${base}/report`,
      label: readiness.report_approved ? "View Approved Report" : "View Report",
      needsFindingsStep: false,
    }
  }

  const findingsLocked = !!readiness.findings_locked

  if (readiness.plan_locked) {
    return {
      screen: "build",
      href: `${base}/build`,
      label: "Continue Report Builder",
      needsFindingsStep: !findingsLocked,
    }
  }

  return {
    screen: "plan",
    href: `${base}/plan`,
    label: "Open Report Builder",
    needsFindingsStep: !findingsLocked,
  }
}
