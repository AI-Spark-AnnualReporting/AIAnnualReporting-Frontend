"use client"

import { use, useEffect } from "react"
import { RouteGuard } from "@/components/auth/RouteGuard"
import { PageLoader } from "@/components/ui/spinner"
import { EditorBlocked, ReportEditor } from "@/components/report/ReportEditor"
import { useArabicReport, useSaveArabicReport } from "@/hooks/useReportBuilder"
import { useReportReview } from "@/hooks/useReportReview"

/**
 * Edit Arabic: the PM editing the whole Arabic report by hand, on one page.
 * After the client asked for changes, saving makes the next Arabic version.
 */
export default function EditArabicPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return (
    <RouteGuard allowedRoles={["project_manager", "admin"]}>
      <EditArabicShell cycleId={id} />
    </RouteGuard>
  )
}

function EditArabicShell({ cycleId }: { cycleId: string }) {
  const arabicQuery = useArabicReport(cycleId)
  const review = useReportReview(cycleId, !!arabicQuery.data, true).data
  const save = useSaveArabicReport(cycleId)

  // Full width, like the report pages.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("sidebar-set-mode", { detail: { mode: "hidden" } }))
    return () => {
      window.dispatchEvent(new CustomEvent("sidebar-set-mode", { detail: { mode: "expanded" } }))
    }
  }, [])

  const arabicPage = `/pm/cycles/${cycleId}/report/arabic`
  const back = "Back to the Arabic report"
  if (arabicQuery.isLoading) return <PageLoader />
  const report = arabicQuery.data
  if (!report) {
    return <EditorBlocked backHref={arabicPage} backLabel={back}
                          message="There is no Arabic report to edit yet. Create it first." />
  }
  // Not while the client has it, nor once they approved it.
  if (review?.awaiting_client) {
    return <EditorBlocked backHref={arabicPage} backLabel={back}
                          message="The Arabic report is with the client for review. You can edit it once they answer." />
  }
  if (review && !review.can_reassemble) {
    return <EditorBlocked backHref={arabicPage} backLabel={back}
                          message="The client approved this Arabic report, so it can't be changed." />
  }
  // The client's comments come from the latest round that asked for changes:
  // after the first save makes the next version, that one has none yet.
  const askedForChanges = review?.versions.find((version) => version.status === "changes_requested")
  return (
    <ReportEditor
      report={report}
      arabic
      backHref={arabicPage}
      reviewComments={askedForChanges}
      latestStatus={review?.versions[0]?.status}
      saving={save.isPending}
      onSave={(body) => save.mutateAsync(body)}
    />
  )
}
