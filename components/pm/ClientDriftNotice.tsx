import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

/* ────────────────────────────────────────────────────────────────────────────
   "You've changed this since they sent it."

   Shown in two places on purpose: on the page, where the editing happens, and
   again in the approve dialog, where the signature happens. One of those alone
   is not enough — on the page it can be scrolled past, and in the dialog it
   arrives after the work is already done.

   Deliberately says THAT something changed, not what. The detail was a list of
   quoted slogans that read like an error report; what the reader has to decide
   is only whether the client should see it again, and the page below already
   shows the current wording.

   The client's own link keeps showing the version THEY sent, for good. This
   box is the only place the difference is ever stated.
──────────────────────────────────────────────────────────────────────────── */

export function ClientDriftNotice({
  changed,
  canSendBack = true,
  className,
}: {
  /** Whether anything has moved since they sent it. */
  changed: boolean
  /** False once it is signed off — sending it back is no longer an option, so
   *  offering it in the copy would be a dead end. */
  canSendBack?: boolean
  className?: string
}) {
  if (!changed) return null

  return (
    <div
      className={cn(
        "rounded-2xl border border-amber-300 bg-amber-50 p-4",
        className,
      )}
    >
      <p className="flex items-start gap-1.5 text-sm font-semibold text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        You&apos;ve changed this since they sent it
      </p>
      <p className="mt-1.5 ps-6 text-xs text-amber-800">
        They approved the earlier wording and their link still shows it.
        {canSendBack ? " Send it back if they should see this." : ""}
      </p>
    </div>
  )
}
