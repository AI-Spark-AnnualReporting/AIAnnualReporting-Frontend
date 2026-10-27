"use client"

import { use, useEffect, useState } from "react"
import { toast } from "sonner"
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Link2Off,
  Loader2,
  MessageSquare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageLoader } from "@/components/ui/spinner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FinalReportView } from "@/components/report/FinalReportView"
import {
  CommentsRail,
  SectionComments,
  useClientComments,
} from "@/components/report-review/ClientComments"
import { ArabicEdition } from "@/components/report/ArabicTranslation"
import {
  CentriyonFooter,
  CentriyonMark,
  ClientShareBanner,
  type BannerStatus,
} from "@/components/share/ClientShareBanner"
import {
  clientReportReviewApi,
  type ClientReviewView,
} from "@/lib/api/reportReview"

/* ────────────────────────────────────────────────────────────────────────────
   The client reviewing the annual report. No login: the link is the key.

   Same branding as the kickoff client page (ClientShareBanner), and the report
   drawn exactly as the PM's report page draws it (FinalReportView): the
   designed cover, a contents list, then the sections in the report's design.

   Comments like the Communication Hub reviewer screen: "Add comment" under
   each section, all of them listed in the rail. Then Approve or Request
   changes. That choice is final, so it is asked once more before it is sent.
──────────────────────────────────────────────────────────────────────────── */

type LoadState = "loading" | "ready" | "dead" | "closed" | "stumbled"
type Decision = "approve" | "request_changes"

/** The server's message, or a fallback. The public client has no interceptor. */
function errorDetail(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === "string" && detail ? detail : fallback
}

/** The HTTP status of a failed public call, if there was one. */
function errorStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status
}

/** The kickoff banner's states, from the report link's status. */
function bannerStatus(view: ClientReviewView): BannerStatus {
  if (view.status === "approved") return "approved"
  if (view.status === "changes_requested") return "sent"
  return "open"
}

function bannerTitle(view: ClientReviewView): string {
  if (view.status === "approved") return "Thank you, you approved this report"
  if (view.status === "changes_requested") return "Thank you, your changes were sent"
  return view.is_arabic ? "Review the Arabic version of your annual report" : "Review your annual report"
}

function bannerSubtitle(view: ClientReviewView): string {
  if (view.status === "approved") return "This version is now final."
  if (view.status === "changes_requested") {
    return "The team will make the changes and send you a new version."
  }
  return "Read the report, write any comments in the box, then approve it or ask for changes. You can only send your review once."
}

export default function ClientReportReviewPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = use(params)
  const [state, setState] = useState<LoadState>("loading")
  const [closedMessage, setClosedMessage] = useState("")
  const [view, setView] = useState<ClientReviewView | null>(null)

  useEffect(() => {
    let cancelled = false
    clientReportReviewApi
      .view(token)
      .then((next) => {
        if (cancelled) return
        setView(next)
        setState("ready")
      })
      .catch((err) => {
        if (cancelled) return
        const status = errorStatus(err)
        if (status === 404) setState("dead")
        else if (status === 410) {
          setClosedMessage(errorDetail(err, "This link was withdrawn."))
          setState("closed")
        } else setState("stumbled")
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (state === "loading") return <PageLoader />
  if (state === "stumbled") {
    return (
      <Notice
        icon={<AlertTriangle className="h-5 w-5 text-amber-700" />}
        title="We couldn't load this right now."
        body="Your link is fine. Something went wrong at our end. Try again in a moment."
        action={<Button onClick={() => window.location.reload()}>Try again</Button>}
      />
    )
  }
  if (state === "closed") {
    return (
      <Notice
        icon={<Link2Off className="h-5 w-5 text-muted-foreground" />}
        title={closedMessage}
        body="Ask your contact for a new link if you still need to review the report."
      />
    )
  }
  if (state === "dead" || !view) {
    return (
      <Notice
        icon={<Link2Off className="h-5 w-5 text-muted-foreground" />}
        title="This link is no longer valid."
        body="It may have been replaced by a newer one. Check your inbox for a more recent message, or contact your Centriyon contact."
      />
    )
  }

  return <ReviewScreen token={token} view={view} onView={setView} />
}

/** A centred card for the states where there is no report to show. Same as the kickoff page. */
function Notice({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-muted/30 p-6">
      <CentriyonMark />
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">{icon}</span>
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
        {action}
      </div>
    </div>
  )
}

function ReviewScreen({
  token,
  view,
  onView,
}: {
  token: string
  view: ClientReviewView
  onView: (view: ClientReviewView) => void
}) {
  const open = view.status === "pending"
  const comments = useClientComments(token, view.comments)
  const hasComments = comments.comments.length > 0
  const [decision, setDecision] = useState<Decision | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const cycleLine = `${view.company_name ? `${view.company_name} · ` : ""}${view.cycle_name}`
  const facts = open
    ? [`${view.is_arabic ? "Arabic version" : "Version"} ${view.version_no}`]
    : []

  const submit = async () => {
    if (!decision) return
    setSubmitting(true)
    try {
      const next = await clientReportReviewApi.submit(token, { decision })
      onView(next)
      setDecision(null)
    } catch (err) {
      toast.error(errorDetail(err, "Couldn't send your review. Please try again."))
    } finally {
      setSubmitting(false)
    }
  }

  const download = async () => {
    setDownloading(true)
    try {
      await clientReportReviewApi.downloadPdf(token)
    } catch (err) {
      toast.error((err as Error)?.message || "Couldn't make the PDF.")
    } finally {
      setDownloading(false)
    }
  }

  const report = (
    <FinalReportView
      report={view.report}
      cycle={{
        cycle_name: view.cycle_name,
        fiscal_year: view.fiscal_year ?? undefined,
        content_language: view.content_language,
      }}
      assembled={view.assembled}
      // The translated Arabic keeps Western digits, as on the PM's Arabic page.
      westernDigits={view.is_arabic}
      showContents
      sectionFooter={(code, title) => (
        <SectionComments sectionCode={code} title={title} open={open} api={comments} />
      )}
    />
  )

  return (
    <div className="min-h-screen bg-muted/30">
      <ClientShareBanner
        wide
        cycleName={cycleLine}
        title={bannerTitle(view)}
        subtitle={bannerSubtitle(view)}
        facts={facts}
        status={bannerStatus(view)}
        submittedAt={view.decided_at}
        contactName={view.contact_name}
        contactEmail={view.contact_email}
      />

      {/* Pulled up into the banner's lower edge, as on the kickoff page. */}
      <div className="relative mx-auto -mt-12 max-w-6xl px-4 pb-10 sm:px-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 rounded-2xl border bg-card px-2 shadow-sm sm:px-4">
            {view.is_arabic ? <ArabicEdition>{report}</ArabicEdition> : report}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            {view.message && open && (
              <div className="rounded-2xl border bg-card p-4 text-sm shadow-sm">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">A note from your contact</p>
                <p className="whitespace-pre-wrap">{view.message}</p>
              </div>
            )}

            {view.previous_comments.length > 0 && (
              <div className="rounded-2xl border bg-card p-4 text-sm shadow-sm">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  Your comments on version {view.version_no - 1}
                </p>
                <div className="space-y-1.5">
                  {view.previous_comments.map((comment) => (
                    <div key={comment.id} className="rounded-md bg-muted/50 p-2 text-xs">
                      <p className="text-[11px] font-semibold text-muted-foreground" dir="auto">
                        {comment.section_title ?? "Whole report"}
                      </p>
                      <p className="whitespace-pre-wrap" dir="auto">{comment.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
              <CommentsRail open={open} api={comments} />
              {open && (
                <div className="space-y-2 border-t pt-3">
                  <Button variant="brand" className="w-full" onClick={() => setDecision("approve")}>
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    Approve the report
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => setDecision("request_changes")}>
                    <MessageSquare className="mr-1.5 h-4 w-4" />
                    Request changes
                  </Button>
                </div>
              )}

              <Button variant="ghost" size="sm" className="w-full" onClick={download} disabled={downloading}>
                {downloading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                )}
                Download PDF
              </Button>
            </div>
          </aside>
        </div>

        <CentriyonFooter />
      </div>

      <Dialog open={decision !== null} onOpenChange={(next) => !submitting && !next && setDecision(null)}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decision === "approve" ? "Approve the report?" : "Request changes?"}
            </DialogTitle>
            <DialogDescription>
              {decision === "approve"
                ? `Approving makes version ${view.version_no} final. It can't be changed after this.`
                : "Your comments go to the team, and they'll send you a new version."}
            </DialogDescription>
          </DialogHeader>
          {/* Approving accepts the report as it is: the server discards the
              comments, so say so before they click. */}
          {decision === "approve" && hasComments && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-900">
              You have {comments.comments.length} comment{comments.comments.length === 1 ? "" : "s"}.
              Approving discards {comments.comments.length === 1 ? "it" : "them"}: the report is accepted as it is.
              To send {comments.comments.length === 1 ? "it" : "them"} to the team, choose Request changes instead.
            </p>
          )}
          {decision === "request_changes" && !hasComments && (
            <p className="text-xs text-amber-700">Add a comment saying what should change first.</p>
          )}
          {/* What goes to the team, so the client sees exactly what they send. */}
          {decision === "request_changes" && hasComments && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">
                Your comments ({comments.comments.length})
              </p>
              <div className="max-h-64 space-y-1.5 overflow-y-auto">
                {comments.comments.map((comment) => (
                  <div key={comment.id} className="rounded-md border bg-muted/40 p-2 text-sm">
                    <p className="text-[11px] font-semibold text-indigo-700" dir="auto">
                      {comment.section_title ?? "Whole report"}
                    </p>
                    <p className="whitespace-pre-wrap break-words" dir="auto">{comment.body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDecision(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="brand"
              onClick={submit}
              disabled={submitting || (decision === "request_changes" && !hasComments)}
            >
              {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {decision === "approve" ? "Approve" : "Send"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

