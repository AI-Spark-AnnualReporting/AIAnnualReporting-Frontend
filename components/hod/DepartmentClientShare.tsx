"use client"

import { useState } from "react"
import { toast } from "sonner"
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
import { cn } from "@/lib/utils"
import {
  useApproveClientShare,
  useRemindClient,
  useSendBackClientShare,
  useShareWithClient,
} from "@/hooks/useHod"
import type { DepartmentShare } from "@/lib/api/hod"
import {
  AlertTriangle, BellRing, Check, CheckCircle2, Clock, Copy, Info, Loader2, Mail,
  MessageSquareQuote, Send, Undo2,
} from "lucide-react"

/* ────────────────────────────────────────────────────────────────────────────
   A department's questions with the client, on the HOD's page. Spark-led
   sessions only (the server says so with `required`).

   Same look as the kickoff's ShareWithClientButton: a button that carries the
   state, and a dialog behind it with the one thing to do next. Two rules differ
   from the kickoff:
   - It is sent once. No Re-share: the link can't be replaced or withdrawn.
   - Nobody edits the questions after sending, so there is no "you changed it
     since they replied" notice.
──────────────────────────────────────────────────────────────────────────── */

const fmt = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : ""

/** A plain shape check: something@something.something, no spaces. The
 *  server checks properly; this only stops an obvious typo from being sent
 *  once and for all (a share can't be re-sent). */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/** A reminder is allowed once every 24 hours. */
function remindedToday(share: DepartmentShare): boolean {
  if (!share.last_reminded_at) return false
  return Date.now() - new Date(share.last_reminded_at).getTime() < 24 * 60 * 60 * 1000
}

/** When the next reminder is allowed: 24 hours after the last one. */
function nextReminderAt(share: DepartmentShare): string | null {
  if (!share.last_reminded_at) return null
  const when = new Date(new Date(share.last_reminded_at).getTime() + 24 * 60 * 60 * 1000)
  const time = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  const today = new Date().toDateString() === when.toDateString()
  return today ? time : `${time} on ${fmt(when.toISOString())}`
}

/** The button's label, icon and colour for each state. */
function trigger(share: DepartmentShare | null) {
  if (!share) return { label: "Send to client", icon: Mail, className: "bg-indigo-600 text-white hover:bg-indigo-700" }
  if (share.status === "pending") {
    return { label: "Waiting on client", icon: Clock, className: "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100" }
  }
  if (share.status === "responded") {
    return { label: "Client responded", icon: Check, className: "bg-indigo-600 text-white hover:bg-indigo-700" }
  }
  return { label: "Client approved", icon: CheckCircle2, className: "border-green-300 bg-green-50 text-green-800 hover:bg-green-100" }
}

export function DepartmentShareButton({
  sessionId,
  departmentName,
  share,
  suggestedEmail,
  blockedReason,
  nothingToApprove = false,
}: {
  sessionId: string
  departmentName: string
  share: DepartmentShare | null
  /** The address this department used last time, pre-filled and editable. */
  suggestedEmail?: string | null
  /** When set, the button is greyed out with this as its tooltip. */
  blockedReason?: string
  /** True when the client rejected every question. Approving would leave
   *  nothing to assign, so only Send back is offered. */
  nothingToApprove?: boolean
}) {
  const [open, setOpen] = useState(false)
  // null = untouched, so the suggested address shows until they type.
  const [email, setEmail] = useState<string | null>(null)
  const emailValue = email ?? suggestedEmail ?? ""
  const [sendBackOpen, setSendBackOpen] = useState(false)
  const [sendBackNote, setSendBackNote] = useState("")
  // Sending and approving are one-way, so each has a confirm step inside
  // this same window.
  const [confirm, setConfirm] = useState<"send" | "approve" | null>(null)

  // Set on the first click of Send it / Approve / Send back and kept until the
  // request ends, so a double click can't fire the action twice.
  const [submitting, setSubmitting] = useState(false)

  const shareMutation = useShareWithClient(sessionId)
  const approveMutation = useApproveClientShare(sessionId)
  const sendBackMutation = useSendBackClientShare(sessionId)
  const remindMutation = useRemindClient(sessionId)
  const busy =
    submitting ||
    shareMutation.isPending || approveMutation.isPending ||
    sendBackMutation.isPending || remindMutation.isPending

  const t = trigger(share)
  const TriggerIcon = t.icon

  const close = () => {
    setOpen(false)
    setConfirm(null)
    setSendBackOpen(false)
    setSubmitting(false)
  }

  /** Run one one-way action once: lock first, unlock only if it failed. */
  const runOnce = (action: (onError: () => void) => void) => {
    if (submitting) return
    setSubmitting(true)
    action(() => setSubmitting(false))
  }

  const copyLink = async () => {
    if (!share) return
    try {
      await navigator.clipboard.writeText(share.url)
      toast.success("Link copied.")
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually.")
    }
  }

  const send = () =>
    runOnce((onError) =>
      shareMutation.mutate(emailValue.trim(), { onSuccess: close, onError }),
    )
  const approve = () =>
    runOnce((onError) => approveMutation.mutate(undefined, { onSuccess: close, onError }))
  const sendBack = () =>
    runOnce((onError) =>
      sendBackMutation.mutate(sendBackNote.trim(), {
        onSuccess: () => {
          setSendBackNote("")
          setSendBackOpen(false)
          close()
        },
        onError,
      }),
    )

  // Once the client has replied, the two choices sit on the page itself (each
  // still opens the dialog: a note for Send back, a confirm for Approve).
  const replied = share?.status === "responded"

  return (
    <>
      {replied ? (
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSendBackOpen(true)
              setOpen(true)
            }}
            className="border-rose-200 text-rose-700 hover:bg-rose-50"
          >
            <Undo2 className="h-4 w-4" /> Send back
          </Button>
          {!nothingToApprove && (
            <Button
              type="button"
              onClick={() => {
                setConfirm("approve")
                setOpen(true)
              }}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <Check className="h-4 w-4" /> Approve answers
            </Button>
          )}
        </div>
      ) : (
        <Button
          type="button"
          variant={!share ? "default" : "outline"}
          onClick={() => setOpen(true)}
          disabled={!!blockedReason}
          title={blockedReason}
          className={cn("shrink-0", t.className)}
        >
          <TriggerIcon className="h-4 w-4" />
          {t.label}
        </Button>
      )}

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="sm:max-w-lg">
          {confirm !== null ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {confirm === "send"
                    ? `Send the ${departmentName} questions to the client?`
                    : "Approve the client's answers?"}
                </DialogTitle>
                <DialogDescription>
                  {confirm === "send" ? (
                    <>
                      They&apos;ll get an email with a private link to{" "}
                      <span className="font-medium text-foreground">{emailValue.trim()}</span>.
                      From this point the questions can&apos;t be edited here, and the
                      link can&apos;t be sent again to anyone else.
                    </>
                  ) : (
                    <>
                      This fixes the questions for good, and you can then assign them.
                      The client&apos;s answers will be filled in for whoever answers
                      them. It can&apos;t be undone — send it back instead if anything
                      still needs their eyes.
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirm(null)}>
                  ← Back
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={confirm === "send" ? send : approve}
                  className="bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : confirm === "send" ? (
                    <Send className="h-4 w-4" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {confirm === "send" ? "Send it" : "Approve"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  {!share && "Send to client"}
                  {share?.status === "pending" && "Waiting on the client"}
                  {share?.status === "responded" && "The client has responded"}
                  {share?.status === "approved" && "Approved"}
                </DialogTitle>
                <DialogDescription>
                  The client answers the {departmentName} questions. They can reword or
                  reject any, and add their own the first time.
                </DialogDescription>
              </DialogHeader>

              {!share ? (
                /* ── Not sent yet: the form ── */
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Client email</label>
                    <Input
                      type="email"
                      value={emailValue}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="client@company.com"
                      className="text-sm"
                    />
                  </div>
                  {emailValue.trim() !== "" && !looksLikeEmail(emailValue) && (
                    <p className="text-xs font-medium text-amber-700">
                      That email address doesn&apos;t look right.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    They&apos;ll get an email with a private link. No account needed.
                    This can only be sent once — check the address.
                  </p>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button type="button" variant="outline" onClick={close}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={busy || !looksLikeEmail(emailValue)}
                      onClick={() => setConfirm("send")}
                      className="bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      <Send className="h-4 w-4" /> Send to client
                    </Button>
                  </div>
                </div>
              ) : (
                /* ── Sent: status, and whatever can be done next ── */
                <div className="space-y-3">
                  <div
                    className={cn(
                      "rounded-xl border p-4",
                      share.status === "approved"
                        ? "border-green-200 bg-green-50/60"
                        : share.status === "responded"
                          ? "border-indigo-200 bg-indigo-50/60"
                          : "border-amber-200 bg-amber-50/60",
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">
                      {share.status === "pending" &&
                        `Sent to ${share.client_email} on ${fmt(share.created_at)} · no reply yet`}
                      {share.status === "responded" &&
                        `${share.client_email} responded ${fmt(share.responded_at)}`}
                      {share.status === "approved" && `Approved on ${fmt(share.approved_at)}`}
                    </p>
                    {share.status === "pending" && share.reminder_count > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {share.reminder_count} reminder{share.reminder_count === 1 ? "" : "s"} sent ·
                        last {fmt(share.last_reminded_at)}
                      </p>
                    )}
                    {share.status === "responded" && !nothingToApprove && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Their answers are on the page behind this. Approve them, or send
                        them back with a note.
                      </p>
                    )}
                    {share.status === "responded" && nothingToApprove && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-amber-700">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        The client rejected every question, so there&apos;s nothing to
                        approve. Send it back to them with a note.
                      </p>
                    )}
                    {share.revision_count > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sent back {share.revision_count} time{share.revision_count === 1 ? "" : "s"}
                        {share.review_comment ? ` · last note: “${share.review_comment}”` : ""}
                      </p>
                    )}
                    {share.status === "pending" && share.email_status === "failed" && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-amber-700">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        We couldn&apos;t email this — copy the link and send it yourself.
                      </p>
                    )}
                    {share.status === "pending" && remindedToday(share) && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-indigo-700">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>One reminder a day — you can send another after {nextReminderAt(share)}.</span>
                      </p>
                    )}
                  </div>

                  {sendBackOpen && (
                    <div className="space-y-1.5 rounded-xl border border-border bg-muted/30 p-3">
                      <label className="text-xs font-medium text-foreground">What should they look at?</label>
                      <Textarea
                        value={sendBackNote}
                        onChange={(e) => setSendBackNote(e.target.value)}
                        rows={3}
                        autoFocus
                        placeholder="e.g. Please add the 2025 headcount to question 3."
                        className="text-sm"
                      />
                    </div>
                  )}

                  {share.status !== "approved" && (
                    <div className="rounded-xl border border-border bg-muted/30 p-3">
                      <p className="text-xs font-medium text-muted-foreground">Their link</p>
                      <p className="mt-1 break-all font-mono text-xs text-foreground">{share.url}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap justify-end gap-2 pt-1">
                    {share.status !== "approved" && (
                      <Button type="button" variant="outline" size="sm" onClick={copyLink}>
                        <Copy className="h-4 w-4" /> Copy link
                      </Button>
                    )}
                    {share.status === "pending" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy || remindedToday(share)}
                        onClick={() => remindMutation.mutate()}
                      >
                        {remindMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <BellRing className="h-4 w-4" />
                        )}
                        {remindMutation.isPending
                          ? "Sending reminder…"
                          : remindedToday(share)
                            ? "Reminder sent today"
                            : "Send reminder"}
                      </Button>
                    )}
                    {share.status === "responded" && !sendBackOpen && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setSendBackOpen(true)}
                        className="border-amber-300 text-amber-800 hover:bg-amber-50"
                      >
                        <Undo2 className="h-4 w-4" /> Send back to them
                      </Button>
                    )}
                    {share.status === "responded" && sendBackOpen && (
                      <Button
                        type="button"
                        disabled={busy || !sendBackNote.trim()}
                        onClick={sendBack}
                        className="bg-amber-600 text-white hover:bg-amber-700"
                      >
                        {sendBackMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Undo2 className="h-4 w-4" />
                        )}
                        Send back with this note
                      </Button>
                    )}
                    {share.status === "responded" && !sendBackOpen && !nothingToApprove && (
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirm("approve")}
                        className="bg-indigo-600 text-white hover:bg-indigo-700"
                      >
                        <Check className="h-4 w-4" /> Approve
                      </Button>
                    )}
                    {share.status === "approved" && (
                      <Button type="button" variant="outline" onClick={close}>
                        Close
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** One line under the page header saying where the client step is. */
export function DepartmentShareBanner({ share }: { share: DepartmentShare }) {
  const tone =
    share.status === "approved"
      ? "border-green-200 bg-green-50 text-green-900"
      : share.status === "responded"
        ? "border-indigo-200 bg-indigo-50 text-indigo-900"
        : "border-amber-200 bg-amber-50 text-amber-900"
  const title =
    share.status === "approved"
      ? `Client answered · approved ${fmt(share.approved_at)}. The questions are fixed now.`
      : share.status === "responded"
        ? `The client responded ${fmt(share.responded_at)}. Review their answers below.`
        : `With the client (${share.client_email}) since ${fmt(share.created_at)}. The questions can't be edited here.`
  return (
    <div className={cn("mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-2.5 text-xs font-semibold", tone)}>
      <span>{title}</span>
      {share.client_note && share.status !== "pending" && (
        <span className="flex min-w-0 items-center gap-1.5 font-normal">
          <MessageSquareQuote className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate" title={share.client_note}>“{share.client_note}”</span>
        </span>
      )}
    </div>
  )
}
