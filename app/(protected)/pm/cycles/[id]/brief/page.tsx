"use client"

import { use } from "react"
import Link from "next/link"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { PageHeader } from "@/components/ui/page-header"
import { PageLoader } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { ProsePreview } from "@/components/ui/prose-preview"
import { AreasOfFocusSummary } from "@/components/report/AreasOfFocusSummary"
import {
  ConceptMessagesSummary,
  ErrorPanel,
} from "@/components/report/ConceptMessagesSummary"
import type { AreaOfFocus } from "@/lib/api/pm"
import type { ContentLanguage } from "@/types"
import { ArrowLeft, Target } from "lucide-react"

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


export default function CycleBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, isLoading } = usePMCycleDashboard(id)

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

      {/* Concept messages — same reasoning as the areas above: the component
          draws its own heading, empty state and error state. */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <ConceptMessagesSummary cycleId={id} isRtl={isRtl} />
      </div>
    </div>
  )
}
