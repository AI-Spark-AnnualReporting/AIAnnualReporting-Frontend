"use client"

import { use } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, ArrowLeft } from "lucide-react"

import { RouteGuard } from "@/components/auth/RouteGuard"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { PageLoader } from "@/components/ui/spinner"
import { ReportValidateLoader } from "@/components/report/ReportValidateLoader"
import { ValidationPanel } from "@/components/report/ValidationPanel"
import { useRetryExternalValidation, useValidationJob } from "@/hooks/useReportBuilder"
import { formatDateTime } from "@/lib/utils"

/* One Annual Report Validator run: live progress while it runs, then the
   result. The job id is in the URL, so a refresh or a bookmark comes straight
   back here - the run carries on on the server either way. */
export default function ValidatorRunPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params)
  return (
    <RouteGuard allowedRoles={["admin"]}>
      <ValidatorRun jobId={jobId} />
    </RouteGuard>
  )
}

// Back goes to the Validator's own form (with Previous validations under
// it), not out to the PM dashboard. Fixed, not router.back(): this page can
// be the first thing loaded in the tab (Spark's hand-off redirect lands here
// with a window.location.href, not an in-app navigation, and a bookmark or
// shared link does too), so there is not always a real "previous page" to
// return to.
const HOME_PATH = "/pm/annual-report-validator"

function ValidatorRun({ jobId }: { jobId: string }) {
  const job = useValidationJob(jobId)
  const retry = useRetryExternalValidation()
  const router = useRouter()

  function goBack() {
    router.push(HOME_PATH)
  }

  // Same report, brief, concepts and tone the original run used - no
  // re-upload. The server already saved them once the run got that far.
  function retryThis() {
    retry.mutate(jobId, {
      onSuccess: (data) => router.push(`/pm/annual-report-validator/runs/${data.job_id}`),
    })
  }

  if (job.isLoading) return <PageLoader />

  // Nothing to retry - the id itself doesn't resolve to a job, so there's no
  // saved report behind it either.
  if (job.isError || !job.data) {
    return <Failed message="This validation could not be found." onBack={goBack} />
  }

  const { status, stage, validation, error } = job.data
  if (status === "running") return <ReportValidateLoader stage={stage} />
  if (status === "failed" || !validation) {
    return (
      <Failed
        message={error || "Validation failed. Please try again."}
        onRetry={retryThis}
        retrying={retry.isPending}
        onBack={goBack}
      />
    )
  }

  return (
    <div className="w-full space-y-6 p-6">
      <Button onClick={goBack} className="gap-1.5">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>
      <PageHeader
        title="Annual Report Validator"
        description={`${validation.filename ?? "External report"} — checked ${formatDateTime(validation.validated_at)}`}
        action={
          <Button variant="outline" disabled={retry.isPending} onClick={retryThis}>
            {retry.isPending ? "Starting…" : "Validate again"}
          </Button>
        }
      />
      <ValidationPanel validation={validation} />
    </div>
  )
}

function Failed({
  message,
  onRetry,
  retrying,
  onBack,
}: {
  message: string
  // Absent when the id itself didn't resolve to a job - nothing saved to
  // retry with either.
  onRetry?: () => void
  retrying?: boolean
  onBack: () => void
}) {
  return (
    <div className="mx-auto w-full max-w-xl space-y-4 p-6">
      <Button onClick={onBack} className="gap-1.5">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>
      <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
        <div>
          <p className="text-sm font-bold text-rose-900">Validation did not finish</p>
          <p className="mt-0.5 text-sm text-rose-800">{message}</p>
        </div>
      </div>
      {onRetry && (
        <Button disabled={retrying} onClick={onRetry}>
          {retrying ? "Starting…" : "Validate again"}
        </Button>
      )}
    </div>
  )
}
