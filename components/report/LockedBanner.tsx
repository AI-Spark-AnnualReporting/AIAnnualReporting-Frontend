"use client"

import { CheckCircle2 } from "lucide-react"
import { formatDateTime } from "@/lib/utils"

// Green "section locked" confirmation banner, shared by every mode's locked
// view (content, attach, analyze, generate). Lives in its own neutral module so
// none of those files has to import from another mode's component.
export function LockedBanner({ lockedAt }: { lockedAt: string | null }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100">
        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900">Section locked</p>
        <p className="text-xs text-slate-500 mt-0.5">
          Locked on {formatDateTime(lockedAt)}
        </p>
      </div>
    </div>
  )
}
