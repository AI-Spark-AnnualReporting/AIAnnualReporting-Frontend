"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useAuth } from "@/contexts/AuthContext"
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
  useApproveShare,
  useCreateShare,
  useEscalateShare,
  useSendBackShare,
} from "@/hooks/useShare"
import type { ShareRequest, ShareStage } from "@/lib/api/share"
import { driftSinceResponse, type CurrentBundle } from "@/lib/shareDrift"
import { ClientDriftNotice } from "@/components/pm/ClientDriftNotice"
import {
  AlertTriangle, BellRing, Check, CheckCircle2, Clock, Copy, Loader2, Mail,
  Send, Undo2,
} from "lucide-react"

/* ────────────────────────────────────────────────────────────────────────────
   Client sign-off, as a header button that opens a dialog.

   The button carries the state so the page can be read at a glance; everything
   you can DO lives behind the click, because none of it is needed on most
   visits — the common case is "already approved, carry on".

   Only spark_internal gets controls. Everyone else gets the same button showing
   the same state, and a dialog that explains what they're waiting for. That
   matters more than it looks: without it a client-company PM meets a
   permanently greyed-out Continue button with no explanation on the page.
──────────────────────────────────────────────────────────────────────────── */

const STAGE_COPY: Record<ShareStage, { noun: string; blurb: string }> = {
  questionnaire: {
    noun: "questionnaire",
    blurb: "The client answers these questions — their answers shape the brief.",
  },
  brief: {
    noun: "brief, areas of focus and concept messages",
    blurb: "The client reviews and edits all three together, then sends them back.",
  },
}

const fmt = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : ""

/** A reminder is allowed once a day; the button explains itself rather than
 *  just going dead. */
function remindedToday(share: ShareRequest) {
  if (!share.last_reminded_at) return false
  return Date.now() - new Date(share.last_reminded_at).getTime() < 24 * 60 * 60 * 1000
}

/** Button label and colour follow the state — this is the only bit of the
 *  feature visible without clicking, so it has to carry the whole story. */
function trigger(share?: ShareRequest | null) {
  if (!share)
    return { label: "Share with client", icon: Mail, className: "bg-indigo-600 text-white hover:bg-indigo-700" }
  if (share.status === "pending")
    return { label: "Waiting on client", icon: Clock, className: "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100" }
  if (share.status === "responded")
    return { label: "Client responded", icon: Check, className: "bg-indigo-600 text-white hover:bg-indigo-700" }
  return { label: "Client approved", icon: CheckCircle2, className: "border-green-300 bg-green-50 text-green-800 hover:bg-green-100" }
}

export function ShareWithClientButton({
  cycleId,
  stage,
  share,
  current,
}: {
  cycleId: string
  stage: ShareStage
  share?: ShareRequest | null
  /** What is on the cycle right now. Given, the dialog can tell you when you
   *  are about to sign off something the client never saw. */
  current?: CurrentBundle
}) {
  const { user } = useAuth()
  const isSpark = user?.role === "spark_internal"

  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [sendBackNote, setSendBackNote] = useState("")
  const [sendBackOpen, setSendBackOpen] = useState(false)

  const createShare = useCreateShare(cycleId)
  const approveShare = useApproveShare(cycleId)
  const escalateShare = useEscalateShare(cycleId)
  const sendBackShare = useSendBackShare(cycleId)
  const busy =
    createShare.isPending ||
    approveShare.isPending ||
    escalateShare.isPending ||
    sendBackShare.isPending

  // Editing stays open after they respond, so by the time Approve is clicked
  // the text may no longer be the text they saw. Computed for the signed-off
  // state too — the difference does not disappear because someone approved it.
  const changed =
    share?.status === "responded" || share?.status === "approved"
      ? driftSinceResponse(share.response, current).length > 0
      : false

  // Two confirm steps, both one-way actions: sending hands the cycle to
  // someone outside the company, approving is the signature.
  const [confirm, setConfirm] = useState<"send" | "approve" | null>(null)

  const copy = STAGE_COPY[stage]
  const t = trigger(share)
  const TriggerIcon = t.icon

  const copyLink = async () => {
    if (!share) return
    try {
      await navigator.clipboard.writeText(share.url)
      toast.success("Link copied.")
    } catch {
      // Clipboard access needs a secure context; without it the link is still
      // readable on screen, so don't pretend the copy worked.
      toast.error("Couldn't copy — select the link and copy it manually.")
    }
  }

  const send = () =>
    createShare.mutate(
      { stage, client_email: (share?.client_email ?? email).trim() },
      { onSuccess: () => { setConfirm(null); setOpen(false) } },
    )

  const approve = () =>
    approveShare.mutate(stage, {
      onSuccess: () => { setConfirm(null); setOpen(false) },
    })

  return (
    <>
      <Button
        type="button"
        variant={share && share.status !== "responded" ? "outline" : "default"}
        onClick={() => setOpen(true)}
        className={cn("shrink-0", t.className)}
      >
        <TriggerIcon className="h-4 w-4" />
        {t.label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {!share && "Share with client"}
              {share?.status === "pending" && "Waiting on the client"}
              {share?.status === "responded" && "The client has responded"}
              {share?.status === "approved" && "Signed off by the client"}
            </DialogTitle>
            <DialogDescription>{copy.blurb}</DialogDescription>
          </DialogHeader>

          {/* ── Not Spark: state only, no controls ── */}
          {!isSpark ? (
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <p className="text-sm font-medium text-foreground">
                {!share && "Waiting for Spark to send this to your client."}
                {share?.status === "pending" &&
                  `With your client since ${fmt(share.created_at)} — Spark will let you know.`}
                {share?.status === "responded" &&
                  "Your client has responded. Waiting on Spark to approve."}
                {share?.status === "approved" && `Approved ${fmt(share.approved_at)}.`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                The {copy.noun} needs the client&apos;s sign-off before this cycle can move on.
              </p>
            </div>
          ) : !share ? (
            /* ── Nothing shared yet: the form ── */
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Client email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="client@company.com"
                  className="text-sm"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                They&apos;ll get an email with a private link. No account needed.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={busy || !email.includes("@")}
                  onClick={() => setConfirm("send")}
                  className="bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  <Send className="h-4 w-4" /> Share with client
                </Button>
              </div>
            </div>
          ) : (
            /* ── Shared: status + whatever can be done next ── */
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
                    `The client responded ${fmt(share.responded_at)}`}
                  {share.status === "approved" && `Approved on ${fmt(share.approved_at)}`}
                </p>
                {share.status === "pending" && share.reminder_count > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {share.reminder_count} reminder{share.reminder_count === 1 ? "" : "s"} sent ·
                    last {fmt(share.last_reminded_at)}
                  </p>
                )}
                {share.status === "responded" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Review what they sent on the page behind this — approve or send
                    it back from there.
                  </p>
                )}
                {share.revision_count > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sent back {share.revision_count} time
                    {share.revision_count === 1 ? "" : "s"}
                    {share.review_comment ? ` · last note: “${share.review_comment}”` : ""}
                  </p>
                )}
                {/* The mail didn't leave the building — say so plainly and offer
                    the link, or the PM waits forever on a reply that can't come. */}
                {share.email_status === "failed" && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-amber-700">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    We couldn&apos;t email this — copy the link and send it yourself.
                  </p>
                )}
              </div>

              {/* Same notice as the page behind this — the signature is here,
                  so it has to be said here too. */}
              <ClientDriftNotice
                changed={changed}
                canSendBack={share.status !== "approved"}
                className="rounded-xl"
              />

              {/* Opened from the warning, or from Send back below it. One note,
                  same link — their answers stay on the page. */}
              {sendBackOpen && (
                <div className="space-y-1.5 rounded-xl border border-border bg-muted/30 p-3">
                  <label className="text-xs font-medium text-foreground">
                    What should they look at?
                  </label>
                  <Textarea
                    value={sendBackNote}
                    onChange={(e) => setSendBackNote(e.target.value)}
                    rows={3}
                    autoFocus
                    placeholder="e.g. We tightened area 1 — check you're happy with the new wording."
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
                  <>
                    <Button type="button" variant="outline" size="sm" onClick={copyLink}>
                      <Copy className="h-4 w-4" /> Copy link
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      title="Sends a brand-new link — the one already in their inbox stops working"
                      onClick={() => setConfirm("send")}
                      className="text-muted-foreground"
                    >
                      Re-share
                    </Button>
                  </>
                )}
                {share.status === "pending" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || remindedToday(share)}
                    title={
                      remindedToday(share)
                        ? "A reminder already went out today"
                        : "Email the client a reminder"
                    }
                    onClick={() => escalateShare.mutate(stage)}
                  >
                    <BellRing className="h-4 w-4" />
                    {remindedToday(share) ? "Reminder sent today" : "Send reminder"}
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
                    onClick={() =>
                      sendBackShare.mutate(
                        { stage, comment: sendBackNote.trim() },
                        {
                          onSuccess: () => {
                            setSendBackNote("")
                            setSendBackOpen(false)
                            setOpen(false)
                          },
                        },
                      )
                    }
                    className="bg-amber-600 text-white hover:bg-amber-700"
                  >
                    {sendBackShare.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Undo2 className="h-4 w-4" />
                    )}
                    Send back with this note
                  </Button>
                )}
                {share.status === "responded" && !sendBackOpen && (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirm("approve")}
                    className="bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    <Check className="h-4 w-4" />
                    {changed ? "Approve anyway" : "Approve & continue"}
                  </Button>
                )}
                {share.status === "approved" && (
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Close
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── The two one-way steps ──
          Sending hands the cycle to someone outside the company and freezes
          Spark's own editing. Approving is the signature the rest of the wizard
          is gated on. Neither can be taken back, so neither happens on a single
          click. */}
      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirm === "send"
                ? `Send the ${copy.noun} to the client?`
                : "Approve the client's response?"}
            </DialogTitle>
            <DialogDescription>
              {confirm === "send" ? (
                <>
                  They&apos;ll get an email with a private link to{" "}
                  <span className="font-medium text-foreground">
                    {(share?.client_email ?? email).trim() || "the client"}
                  </span>
                  . From this point you can&apos;t add to the set or refine it with
                  AI — only reword what&apos;s there.
                </>
              ) : (
                <>
                  This signs off what the client sent and opens the next step. It
                  can&apos;t be undone — send it back instead if anything still needs
                  their eyes.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {confirm === "approve" && (
            <ClientDriftNotice
              changed={changed}
              canSendBack
              className="rounded-xl"
            />
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Cancel
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
              {confirm === "send" ? "Send it" : changed ? "Approve anyway" : "Approve"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
