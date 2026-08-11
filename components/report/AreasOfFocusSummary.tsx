"use client"

import { Lock, Sparkles, Star } from "lucide-react"
import { type AreaOfFocus } from "@/lib/api/pm"
import { cn } from "@/lib/utils"

/**
 * Read-only presentation of the cycle's areas of focus (`areas_of_focus`) on
 * the plan step: the primary slogan first, then the secondary ones, each with
 * its sub-slogan chips.
 *
 * Nothing is editable here. The primary/secondary choice is made on the
 * Strategic Brief step and the server rejects a half-made one (422), so a
 * toggle on this screen could only ever produce invalid states. Areas with
 * role "none" were dropped by the PM and aren't shown at all.
 */
export function AreasOfFocusSummary({
  areas,
  isRtl,
  locked,
}: {
  areas: AreaOfFocus[]
  isRtl?: boolean
  /** Locked plan → show the lock chip; presentation is identical either way. */
  locked?: boolean
}) {
  // Primary leads, secondary follow in their existing order.
  const selected = areas
    .filter((a) => a.role !== "none")
    .sort((a, b) => (a.role === "primary" ? -1 : b.role === "primary" ? 1 : 0))

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Areas of Focus
          </span>
          <span className="text-xs text-muted-foreground">
            From your approved strategic brief · {selected.length} carried forward
          </span>
        </div>
        {locked && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
            <Lock className="h-3 w-3" />
            Locked
          </span>
        )}
      </div>

      {selected.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-slate-50 px-4 py-8 text-center">
          <Sparkles className="mx-auto mb-2 h-5 w-5 text-slate-400" />
          <p className="text-sm text-slate-500">No areas of focus were chosen.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {selected.map((area, i) => {
            const isPrimary = area.role === "primary"
            return (
              <div
                key={i}
                className={cn(
                  "rounded-xl border bg-white p-4 text-left shadow-sm",
                  isPrimary ? "border-indigo-400 ring-1 ring-indigo-300" : "border-slate-100",
                )}
              >
                <div
                  dir={isRtl ? "rtl" : "ltr"}
                  className={cn("space-y-2", isRtl ? "text-right" : "text-left")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold leading-snug text-slate-900">
                      {area.slogan || <span className="italic text-slate-400">Untitled slogan</span>}
                    </h4>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        isPrimary
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-600",
                      )}
                    >
                      {isPrimary && <Star className="h-2.5 w-2.5 fill-current" />}
                      {area.role}
                    </span>
                  </div>
                  {area.summary && (
                    <p className="text-xs leading-relaxed text-slate-500">{area.summary}</p>
                  )}
                  {area.sub_slogans.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {area.sub_slogans.map((s, k) => (
                        <span
                          key={k}
                          className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50/60 px-2.5 py-1 text-xs font-medium text-indigo-700"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
