"use client"

import { use, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, ArrowLeft } from "lucide-react"

import { RouteGuard } from "@/components/auth/RouteGuard"
import { Button } from "@/components/ui/button"
import { PageLoader } from "@/components/ui/spinner"
import { AiLoadingScreen } from "@/components/report/AiLoadingScreen"
import { ValidationPanel } from "@/components/report/ValidationPanel"
import { checkedAt, ValidatorHeader } from "@/components/validator/validator-ui"
import { useRetryExternalValidation, useValidationJob } from "@/hooks/useReportBuilder"

/* One Annual Report Validator run: live progress while it runs, then the
   result - laid out like admin's page in Centriyon (same loader, header and
   failure card). The job id is in the URL, so a refresh or a bookmark comes
   straight back here; the run carries on on the server either way. */
export default function ValidatorRunPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params)
  return (
    <RouteGuard allowedRoles={["admin"]}>
      <ValidatorRun jobId={jobId} />
    </RouteGuard>
  )
}

// Back goes to the Validator's own form (with Previous validations under it).
// Fixed, not router.back(): this page is often the first one loaded in the
// tab (Spark's hand-off, a bookmark), so there is no previous page to return to.
const HOME_PATH = "/pm/annual-report-validator"

// Centriyon's indigo, not our app's default blue, so Back matches admin's
// page. Inline rather than a Tailwind colour class, so it never depends on a
// stylesheet rebuild to show up.
const BACK_STYLE: React.CSSProperties = { background: "#4040C8", color: "#fff" }

// Same tips admin's loader rotates in Centriyon.
const TIPS = [
  "Findings are weighed, not enforced - nothing here blocks you from using your report elsewhere.",
  "The brief, concept messages and tone are all checked against the report's own wording.",
  "Figure tracing is off for an external report - there are no departments or documents to trace a figure to.",
  "Long reports can take a few minutes. You can leave this page open.",
]

function ValidatorRun({ jobId }: { jobId: string }) {
  const job = useValidationJob(jobId)
  const retry = useRetryExternalValidation()
  const router = useRouter()

  // The finish animation (bar filling to 100%) plays only for a run watched
  // here while it was running. A finished run opened from Previous
  // validations shows its result at once, as admin's page does.
  const [sawRunning, setSawRunning] = useState(false)
  const [revealed, setRevealed] = useState(false)

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

  // Nothing to retry - the id itself doesn't resolve to a job.
  if (job.isError || !job.data) {
    return <Failed message="This validation could not be found." onBack={goBack} />
  }

  const { status, stage, validation, error } = job.data
  // Remembered from an earlier render: React's documented way to keep
  // information from previous renders without an effect.
  if (status === "running" && !sawRunning) setSawRunning(true)
  const finishing = status !== "running" && sawRunning && !revealed

  // The loader also covers the moment between "Validate again" and the new
  // run's page, like admin's page, rather than leaving a "Starting…" button.
  if (status === "running" || finishing || retry.isPending) {
    return (
      // Fixed to the viewport, like Centriyon's running screen, so it stays
      // centred instead of scrolling inside the workspace layout.
      <div style={{ position: "fixed", inset: 0, zIndex: 1400, overflowY: "auto" }}>
        <AiLoadingScreen
          title="Validating your report"
          subtitle={(status === "running" && stage) || "Starting…"}
          milestones={[]}
          indeterminate
          tips={TIPS}
          done={finishing}
          onDone={() => setRevealed(true)}
        />
      </div>
    )
  }

  if (status === "failed" || !validation) {
    return (
      <Failed
        message={error || "Validation failed. Please try again."}
        onRetry={retryThis}
        onBack={goBack}
      />
    )
  }

  return (
    <div className="w-full space-y-6 p-6">
      <Button onClick={goBack} className="gap-1.5" style={BACK_STYLE}>
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>
      <ValidatorHeader
        title="Annual Report Validator"
        description={`${validation.filename ?? "External report"} — checked ${checkedAt(validation.validated_at)}`}
        action={
          <Button variant="outline" onClick={retryThis}>
            Validate again
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
  onBack,
}: {
  message: string
  // Absent when the id itself didn't resolve to a job - nothing to retry.
  onRetry?: () => void
  onBack: () => void
}) {
  return (
    <div className="mx-auto w-full max-w-xl space-y-4 p-6">
      <Button onClick={onBack} className="gap-1.5" style={BACK_STYLE}>
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>
      <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
        <div>
          <p className="text-sm font-bold text-rose-900">Validation did not finish</p>
          <p className="mt-0.5 text-sm text-rose-800">{message}</p>
        </div>
      </div>
      {onRetry && <Button onClick={onRetry}>Validate again</Button>}
    </div>
  )
}
