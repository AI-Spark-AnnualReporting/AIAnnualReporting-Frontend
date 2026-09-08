"use client"

import { use } from "react"
import Link from "next/link"
import { usePMCycleDashboard, useConceptMessages } from "@/hooks/useSessions"
import { PageHeader } from "@/components/ui/page-header"
import { PageLoader, Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { ProsePreview } from "@/components/ui/prose-preview"
import { AreasOfFocusSummary } from "@/components/report/AreasOfFocusSummary"
import { primaryIndexOf } from "@/lib/conceptMessages"
import type { AreaOfFocus, ConceptMessage } from "@/lib/api/pm"
import type { ContentLanguage } from "@/types"
import { cn } from "@/lib/utils"
import {
  ArrowLeft,
  MessageSquareQuote,
  ShieldAlert,
  Sparkles,
  Star,
  Target,
} from "lucide-react"

/* The strategic brief, the areas of focus and the concept messages, read-only.
   All three are written during the kickoff wizard and then disappear: the
   wizard screens that render them are edit screens which bounce you out once
   the cycle has moved on, so they can't double as a viewer.

   Deliberately never redirects. The parent cycle page's isForceKickoff guard
   does not extend to child routes, and the wizard pages that do redirect need a
   ref latch to avoid firing on first paint — rendering an empty state instead
   avoids that class of bug entirely. The header button is gated on the brief
   existing, so the empty states are a fallback, not the normal path. */

/** The card chrome all three sections share — from the kickoff review screen. */
function SectionCard({
  icon: Icon,
  title,
  subtitle,
  meta,
  children,
}: {
  icon: typeof Target
  title: string
  subtitle: string
  meta?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-foreground">{title}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {meta && <div className="flex items-center gap-2">{meta}</div>}
      </div>
      {children}
    </div>
  )
}

/** A real failure, as opposed to "nothing has been written yet". */
function ErrorPanel({ title, body }: { title: string; body: string }) {
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
   controls, with the editable radio replaced by a static badge. */
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

export default function CycleBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, isLoading } = usePMCycleDashboard(id)
  const {
    data: conceptData,
    isLoading: conceptLoading,
    error: conceptError,
  } = useConceptMessages(id)

  if (isLoading) return <PageLoader />

  // The dashboard payload is untyped at the hook, so each page narrows it here.
  const dash = data as
    | {
        cycle?: {
          cycle_name?: string
          kickoff_brief?: string | null
          areas_of_focus?: AreaOfFocus[] | null
          content_language?: ContentLanguage
        }
      }
    | undefined
  const cycle = dash?.cycle
  const brief = cycle?.kickoff_brief?.trim() ?? ""
  const areas = cycle?.areas_of_focus ?? []
  const isRtl = (cycle?.content_language ?? "english") === "arabic"
  const dir = isRtl ? "rtl" : "ltr"

  // Server order is authoritative — generation already returns them
  // primary-area-first, so this never re-sorts.
  const messages = conceptData?.concept_messages ?? []
  const primaryIndex = primaryIndexOf(messages)

  const wordCount = brief ? brief.trim().split(/\s+/).length : 0

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Link href={`/pm/cycles/${id}`}>
          <Button variant="outline" size="icon" className="mt-0.5 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          className="flex-1"
          title="Strategic Brief"
          description={`${cycle?.cycle_name ?? "This cycle"} — the strategic direction, areas of focus, and concept messages behind this report`}
        />
      </div>

      {/* Strategic brief */}
      {brief ? (
        <SectionCard
          icon={Target}
          title="Strategic Brief"
          subtitle="The strategic direction for this cycle's report."
          meta={<span className="shrink-0 text-xs text-muted-foreground">{wordCount} words</span>}
        >
          <div className="mt-4 rounded-lg border bg-muted/20 p-4">
            <ProsePreview content={brief} className="prose-indigo" dir={dir} />
          </div>
        </SectionCard>
      ) : (
        <div className="space-y-3">
          <ErrorPanel
            title="No strategic brief yet"
            body="This cycle's brief hasn't been written. It's created on the kickoff wizard's first step."
          />
          <Link href={`/pm/cycles/${id}/kickoff`}>
            <Button variant="outline">Go to the kickoff brief</Button>
          </Link>
        </div>
      )}

      {/* Areas of focus — the component draws its own heading and empty state,
          so it gets a plain wrapper rather than a SectionCard, or "Areas of
          Focus" would appear twice. */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <AreasOfFocusSummary areas={areas} isRtl={isRtl} />
      </div>

      {/* Concept messages */}
      <SectionCard
        icon={MessageSquareQuote}
        title="Concept Messages"
        subtitle="One per area of focus, primary first."
      >
        <div className="mt-4 space-y-3">
          {conceptLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4" /> Loading concept messages…
            </div>
          ) : conceptError ? (
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
              <Link href={`/pm/cycles/${id}/kickoff/concept`}>
                <Button variant="outline">Go to Concept Messages</Button>
              </Link>
            </div>
          ) : (
            messages.map((m, i) => (
              <ConceptCard
                key={i}
                index={i}
                message={m}
                isPrimary={i === primaryIndex}
                isRtl={isRtl}
              />
            ))
          )}
        </div>
      </SectionCard>
    </div>
  )
}
