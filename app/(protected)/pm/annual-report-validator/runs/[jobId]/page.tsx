"use client"

import { use } from "react"
import Link from "next/link"
import { AlertTriangle } from "lucide-react"

import { RouteGuard } from "@/components/auth/RouteGuard"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { PageLoader } from "@/components/ui/spinner"
import { ReportValidateLoader } from "@/components/report/ReportValidateLoader"
import { ValidationPanel } from "@/components/report/ValidationPanel"
import { useValidationJob } from "@/hooks/useReportBuilder"
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

const FORM_PATH = "/pm/annual-report-validator"

function ValidatorRun({ jobId }: { jobId: string }) {
  const job = useValidationJob(jobId)

  if (job.isLoading) return <PageLoader />

  if (job.isError || !job.data) {
    return <Failed message="This validation could not be found." />
  }

  const { status, stage, validation, error } = job.data
  if (status === "running") return <ReportValidateLoader stage={stage} />
  if (status === "failed" || !validation) {
    return <Failed message={error || "Validation failed. Please try again."} />
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <PageHeader
        title="Annual Report Validator"
        description={`${validation.filename ?? "External report"} — checked ${formatDateTime(validation.validated_at)}`}
        action={
          <Link href={FORM_PATH}>
            <Button variant="outline">Validate another report</Button>
          </Link>
        }
      />
      <ValidationPanel validation={validation} />
    </div>
  )
}

function Failed({ message }: { message: string }) {
  return (
    <div className="mx-auto w-full max-w-xl space-y-4 p-6">
      <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
        <div>
          <p className="text-sm font-bold text-rose-900">Validation did not finish</p>
          <p className="mt-0.5 text-sm text-rose-800">{message}</p>
        </div>
      </div>
      <Link href={FORM_PATH}>
        <Button variant="outline">Start again</Button>
      </Link>
    </div>
  )
}
