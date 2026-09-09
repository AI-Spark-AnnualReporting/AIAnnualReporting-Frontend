"use client"

import Link from "next/link"
import { Lock, ShieldAlert, Sparkles, Star, Target } from "lucide-react"
import { useConceptMessages } from "@/hooks/useSessions"
import { primaryIndexOf } from "@/lib/conceptMessages"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ProsePreview } from "@/components/ui/prose-preview"
import type { ConceptMessage } from "@/lib/api/pm"
import { cn } from "@/lib/utils"

/** A real failure, as opposed to "nothing has been written yet". */
export function ErrorPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" />
      <div>
        <p className="font-semibold text-amber-800">{title}</p>
        <p className="mt-0.5 text-sm text-amber-700">{body}</p>
      </div>
    </div>
  )
}

/* The read half of ConceptMessageCard. That component can't be reused here —
   it takes five mutation callbacks — so this keeps its layout and drops the
   controls, with the editable radio replaced by a static badge.

   Every message renders in full — primary and secondary alike. Both steer the
   section writer, so hiding either one behind a click would leave the PM
   confirming a narrative they haven't read. */
function ConceptCard({
  index,
  message,
  isPrimary,
  isRtl,
}: {
  index: number
  message: ConceptMessage
  isPrimary: boolean
  isRtl: boolean
}) {
  const dir = isRtl ? "rtl" : "ltr"
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        isPrimary
          ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-300"
          : "border-indigo-100 bg-indigo-50/40",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-xs font-semibold text-indigo-600">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {/* Which area this was written from. The title is read off the
                  copy and no longer echoes the slogan, so this is the only
                  link back — and it's absent on hand-added messages. */}
              {message.area_slogan?.trim() && (
                <p
                  dir={dir}
                  className={cn(
                    "mb-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground",
                    isRtl && "flex-row-reverse text-right",
                  )}
                >
                  <Target className="h-3 w-3 shrink-0" />
                  <span className="truncate" title={message.area_slogan}>
                    <span className="font-medium">Area of focus:</span> {message.area_slogan}
                  </span>
                </p>
              )}
              <h4
                dir={dir}
                className={cn("text-base font-bold text-indigo-700", isRtl && "text-right")}
              >
                {message.title.trim() || (
                  <span className="font-normal italic text-muted-foreground">Untitled message</span>
                )}
              </h4>
            </div>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                isPrimary ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600",
              )}
            >
              {isPrimary && <Star className="h-2.5 w-2.5 fill-current" />}
              {isPrimary ? "primary" : "secondary"}
            </span>
          </div>

          <div className="mt-3 rounded-lg border bg-white p-4">
            {message.description.trim() ? (
              // Three paragraphs of 100-120 words, split on blank lines.
              <ProsePreview content={message.description} className="prose-indigo" dir={dir} />
            ) : (
              <p className="text-sm italic text-muted-foreground">
                No description was written for this message.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Read-only presentation of the cycle's concept messages — the narrative
 * written per area of focus, primary first.
 *
 * Nothing is editable here, same as the areas-of-focus card it sits beside:
 * these are written on the kickoff wizard's Concept Messages step, which stays
 * the single edit surface. This one only has to let the PM read what the report
 * is about to be built from.
 *
 * Fetches for itself so both the plan step and the brief page mount it as a
 * one-liner rather than threading query state down.
 */
export function ConceptMessagesSummary({
  cycleId,
  isRtl,
  locked,
}: {
  cycleId: string
  isRtl?: boolean
  /** Locked plan → show the lock chip; presentation is identical either way. */
  locked?: boolean
}) {
  const { data, isLoading, error } = useConceptMessages(cycleId)
  const messages = data?.concept_messages ?? []
  const primaryIndex = primaryIndexOf(messages)

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Concept Messages
          </span>
          <span className="text-xs text-muted-foreground">
            The narrative behind each area of focus · primary first
          </span>
        </div>
        {locked && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
            <Lock className="h-3 w-3" />
            Locked
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4" /> Loading concept messages…
        </div>
      ) : error ? (
        // A thrown request, NOT the same thing as an empty list below —
        // conflating them would report a real failure as "none written".
        <ErrorPanel
          title="Couldn't load the concept messages"
          body="The request failed. Refresh the page to try again."
        />
      ) : messages.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-muted p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
            <Sparkles className="h-5 w-5 text-indigo-600" />
          </div>
          <p className="font-semibold text-foreground">No concept messages yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Nothing has been written for this cycle, or the last generation came back empty.
            They&apos;re written and edited on the kickoff wizard&apos;s Concept Messages step.
          </p>
          <Link href={`/pm/cycles/${cycleId}/kickoff/concept`}>
            <Button variant="outline">Go to Concept Messages</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((m, i) => (
            <ConceptCard
              key={i}
              index={i}
              message={m}
              isPrimary={i === primaryIndex}
              isRtl={!!isRtl}
            />
          ))}
        </div>
      )}
    </section>
  )
}
