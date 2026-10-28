"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Check, Copy, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useShareReportWithClient } from "@/hooks/useReportReview"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Spark sending the assembled report to one client.
 *
 * After sending, the link is shown with Copy. It can be copied again later
 * from the Client review card while the client holds it. Resend makes a
 * new one.
 */
export function ShareWithClientDialog({
  cycleId,
  open,
  onOpenChange,
  suggestedEmail,
  versionLabel,
  arabic = false,
}: {
  cycleId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Who the last version went to; filled in, still editable. */
  suggestedEmail?: string | null
  /** e.g. "Version 2", shown in the description. */
  versionLabel: string
  /** Share the Arabic translation instead of the English report. */
  arabic?: boolean
}) {
  const share = useShareReportWithClient(cycleId, arabic)
  const [email, setEmail] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [sentUrl, setSentUrl] = useState<string | null>(null)

  const emailValue = email ?? suggestedEmail ?? ""
  const emailOk = EMAIL_RE.test(emailValue.trim())

  /** Closes the dialog and clears it for next time. */
  const close = () => {
    onOpenChange(false)
    setSentUrl(null)
    setMessage("")
    setEmail(null)
  }

  const send = () => {
    share.mutate(
      { email: emailValue.trim(), message: message.trim() || undefined },
      { onSuccess: (result) => setSentUrl(result.url) },
    )
  }

  const copyLink = async () => {
    if (!sentUrl) return
    try {
      await navigator.clipboard.writeText(sentUrl)
      toast.success("Link copied.")
    } catch {
      toast.error("Couldn't copy. Select the link and copy it by hand.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      {/* One column that may shrink, so nothing inside can push the dialog wider. */}
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{sentUrl ? "Sent to the client" : "Share with client"}</DialogTitle>
          <DialogDescription>
            {sentUrl
              ? "Copy the link now if you want to send it yourself. It can't be shown again; Resend makes a new one."
              : arabic
                ? `${versionLabel} goes to one person by private link, no login needed. While they have it, the Arabic report can't be created again.`
                : `${versionLabel} goes to one person by private link, no login needed. While they have it, nobody can edit or re-assemble the report.`}
          </DialogDescription>
        </DialogHeader>

        {sentUrl ? (
          // min-w-0 all the way down: the link is one long unbroken word, and
          // without it the dialog's grid widens to fit it instead of truncating.
          <div className="min-w-0 space-y-3">
            <div className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/40 p-2">
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={sentUrl}>
                {sentUrl}
              </span>
              <Button size="sm" variant="outline" onClick={copyLink} className="h-7 shrink-0">
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Copy
              </Button>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={close}>
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium" htmlFor="client-email">Client email</label>
              <Input
                id="client-email"
                type="email"
                value={emailValue}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium" htmlFor="client-message">Message (optional)</label>
              <Textarea
                id="client-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Anything they should know before reading it."
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={close} disabled={share.isPending}>
                Cancel
              </Button>
              <Button size="sm" onClick={send} disabled={!emailOk || share.isPending}>
                {share.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                )}
                Send
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
