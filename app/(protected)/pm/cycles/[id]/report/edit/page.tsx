"use client"

import { use, useEffect } from "react"
import { RouteGuard } from "@/components/auth/RouteGuard"
import { PageLoader } from "@/components/ui/spinner"
import { EditorBlocked, ReportEditor } from "@/components/report/ReportEditor"
import { useFinalReport, useSaveReport } from "@/hooks/useReportBuilder"
import { useReportReview } from "@/hooks/useReportReview"

/**
 * Edit report: the PM editing the whole assembled English report by hand.
 *
 * Only after the client asked for changes (the Builder is closed once the
 * report was sent). The first save makes the next version; Save goes back to
 * the report page, which shows the saved text.
 */
export default function EditReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return (
    <RouteGuard allowedRoles={["project_manager", "admin"]}>
      <EditReportShell cycleId={id} />
    </RouteGuard>
  )
}

function EditReportShell({ cycleId }: { cycleId: string }) {
  const reportQuery = useFinalReport(cycleId)
  const review = useReportReview(cycleId, reportQuery.isSuccess).data
  const save = useSaveReport(cycleId)

  // Full width, like the report pages.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("sidebar-set-mode", { detail: { mode: "hidden" } }))
    return () => {
      window.dispatchEvent(new CustomEvent("sidebar-set-mode", { detail: { mode: "expanded" } }))
    }
  }, [])

  const reportPage = `/pm/cycles/${cycleId}/report`
  const back = "Back to the report"
  if (reportQuery.isLoading || (reportQuery.isSuccess && !review)) return <PageLoader />
  const report = reportQuery.data
  if (!report) {
    return <EditorBlocked backHref={reportPage} backLabel={back}
                          message="There is no assembled report to edit yet." />
  }
  // The server's rule: only once the client asked for changes.
  if (review?.share?.status !== "changes_requested") {
    return <EditorBlocked backHref={reportPage} backLabel={back}
                          message="The report can be edited here once the client asks for changes." />
  }
  const askedForChanges = review.versions.find((version) => version.status === "changes_requested")
  return (
    <ReportEditor
      report={report}
      arabic={false}
      backHref={reportPage}
      reviewComments={askedForChanges}
      latestStatus={review.versions[0]?.status}
      saving={save.isPending}
      onSave={async (body) => {
        const saved = await save.mutateAsync(body)
        return { report: saved, warnings: [] }
      }}
    />
  )
}
