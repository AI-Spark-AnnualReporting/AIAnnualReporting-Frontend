"use client"

import Link from "next/link"
import { ArrowLeft, BellRing, Check, Hourglass, Loader2, MailCheck, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useEscalateShare } from "@/hooks/useShare"
import type { ShareRequest } from "@/lib/api/share"
import { cn, formatDateTime } from "@/lib/utils"

/* ────────────────────────────────────────────────────────────────────────────
   The report builder's waiting screen — spark_internal ONLY.

   Shown in place of the Plan screen when Spark started the departments before
   the client signed off the areas of focus. The report is written around the
   client's choice of areas (which one leads), so nothing here can be built
   until that choice exists. The server refuses the same routes, so this card is
   the explanation, not the lock.
──────────────────────────────────────────────────────────────────────────── */

const DAY_MS = 24 * 60 * 60 * 1000

/** A reminder is allowed once a day (the server enforces the same rule). */
function remindedInLastDay(share: ShareRequest): boolean {
  if (!share.last_reminded_at) return false
  return Date.now() - new Date(share.last_reminded_at).getTime() < DAY_MS
}

interface TrackerStep {
  label: string
  icon: typeof Send
  /** When it happened, or null if it hasn't yet. */
  at: string | null | undefined
  detail?: string
}

/** The three moments of the client's sign-off, oldest first. */
function trackerSteps(share: ShareRequest): TrackerStep[] {
  return [
    { label: "Sent", icon: Send, at: share.created_at, detail: share.client_email },
    { label: "Responded", icon: MailCheck, at: share.responded_at },
    { label: "Approved", icon: Check, at: share.approved_at },
  ]
}

function Tracker({ share }: { share: ShareRequest }) {
  const steps = trackerSteps(share)
  // The first step that hasn't happened is the one we are waiting on.
  const currentIndex = steps.findIndex((s) => !s.at)

  return (
    <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {steps.map((step, index) => {
        const done = !!step.at
        const current = index === currentIndex
        const Icon = step.icon
        return (
          <li
            key={step.label}
            className={cn(
              "rounded-xl border p-3 text-left",
              done && "border-emerald-200 bg-emerald-50",
              current && "border-amber-300 bg-amber-50",
              !done && !current && "border-border bg-muted/30",
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full",
                done && "bg-emerald-600 text-white",
                current && "bg-amber-500 text-white",
                !done && !current && "bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
            </span>
            <p className="mt-2 text-sm font-semibold text-foreground">{step.label}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {done ? formatDateTime(step.at as string) : current ? "Waiting…" : "—"}
            </p>
            {done && step.detail && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground" title={step.detail}>
                {step.detail}
              </p>
            )}
          </li>
        )
      })}
    </ol>
  )
}

export function ClientSignoffGate({
  cycleId,
  share,
}: {
  cycleId: string
  share: ShareRequest
}) {
  const escalate = useEscalateShare(cycleId)
  const responded = share.status === "responded"
  const reminderBlocked = remindedInLastDay(share)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center py-10">
      <div className="w-full overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="flex flex-col items-center gap-4 border-b bg-gradient-to-b from-amber-50 to-background px-8 pb-8 pt-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-sm">
            <Hourglass className="h-7 w-7" />
          </span>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {responded
                ? "Your client has replied — approve it to continue"
                : "Waiting for your client's areas of focus"}
            </h1>
            <p className="mx-auto max-w-xl text-sm text-muted-foreground">
              The report is written around the areas of focus and concept messages your
              client chooses, including which one leads. The departments have done their
              part — the report can be built as soon as the client signs off.
            </p>
          </div>
        </div>

        <div className="space-y-6 px-8 py-7">
          <Tracker share={share} />

          {share.reminder_count > 0 && (
            <p className="text-xs text-muted-foreground">
              Reminded {share.reminder_count} {share.reminder_count === 1 ? "time" : "times"}
              {share.last_reminded_at ? `, last on ${formatDateTime(share.last_reminded_at)}` : ""}.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
            <Link href={`/pm/cycles/${cycleId}`}>
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4" /> Back to cycle
              </Button>
            </Link>

            {responded ? (
              <Link href={`/pm/cycles/${cycleId}/kickoff/concept`}>
                <Button className="bg-indigo-600 text-white hover:bg-indigo-700">
                  <MailCheck className="h-4 w-4" /> Review the client&apos;s response
                </Button>
              </Link>
            ) : (
              <Button
                variant="outline"
                disabled={escalate.isPending || reminderBlocked}
                title={reminderBlocked ? "One reminder a day — try again tomorrow." : undefined}
                onClick={() => escalate.mutate("areas")}
              >
                {escalate.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <BellRing className="h-4 w-4" />
                )}
                Send a reminder
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
