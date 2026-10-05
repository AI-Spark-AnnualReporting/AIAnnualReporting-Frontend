"use client"

import Link from "next/link"
import { Lock, ShieldAlert, Sparkles } from "lucide-react"
import { useConceptMessages } from "@/hooks/useSessions"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { AreaConceptCard } from "@/components/report/AreaConceptCard"
import type { AreaOfFocus, ConceptMessage } from "@/lib/api/pm"

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

/** One area of focus with the concept message written from it. */
interface AreaPair {
  area: AreaOfFocus
  message?: ConceptMessage
}

/**
 * Pair message N with area N — position is the only link between the two
 * lists. A message past the end of the areas (added by hand) gets a stand-in
 * area built from its own label, so it is still shown.
 */
function pairAreasWithMessages(areas: AreaOfFocus[], messages: ConceptMessage[]): AreaPair[] {
  const pairs: AreaPair[] = []
  const count = Math.max(areas.length, messages.length)
  for (let i = 0; i < count; i++) {
    const message = messages[i]
    const area = areas[i] ?? {
      slogan: message?.area_slogan ?? message?.title ?? "",
      sub_slogans: [],
      role: message?.role ?? "secondary",
    }
    pairs.push({ area, message })
  }
  return pairs
}

/**
 * The pairs that go into the report, primary first.
 *
 * Same rule as the backend's report_service._area_is_used: an area marked
 * "none" is dropped, and an area with no role yet counts as used — that is a
 * cycle where nobody has chosen, so everything is still in play.
 */
function usedPairsPrimaryFirst(pairs: AreaPair[]): AreaPair[] {
  const used = pairs.filter((p) => p.area.role !== "none")
  const primary = used.filter((p) => p.area.role === "primary")
  const rest = used.filter((p) => p.area.role !== "primary")
  return [...primary, ...rest]
}

/** Read-only, so the card's edit callbacks have nothing to do. */
const noop = () => {}

/**
 * Read-only view of the cycle's areas of focus, each with its concept message
 * in the same card — only the areas the PM/client marked primary or secondary,
 * primary first.
 *
 * Nothing is editable here: both are written on the kickoff wizard, which
 * stays the single edit surface. Reuses the wizard's AreaConceptCard in its
 * read-only mode so the pairing looks the same everywhere.
 *
 * Fetches the messages for itself so both the plan step and the brief page
 * mount it as a one-liner.
 */
export function ConceptMessagesSummary({
  cycleId,
  areas,
  isRtl,
  locked,
}: {
  cycleId: string
  areas: AreaOfFocus[]
  isRtl?: boolean
  /** Locked plan → show the lock chip; presentation is identical either way. */
  locked?: boolean
}) {
  const { data, isLoading, error } = useConceptMessages(cycleId)
  const messages = data?.concept_messages ?? []
  const pairs = usedPairsPrimaryFirst(pairAreasWithMessages(areas, messages))

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Areas of Focus &amp; Concept Messages
          </span>
          <span className="text-xs text-muted-foreground">
            The areas chosen for this report, each with its narrative · primary first
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
      ) : pairs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-muted p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
            <Sparkles className="h-5 w-5 text-indigo-600" />
          </div>
          <p className="font-semibold text-foreground">No areas of focus or concept messages yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Nothing has been chosen for this cycle yet. Areas and their concept messages
            are written and picked on the kickoff wizard.
          </p>
          <Link href={`/pm/cycles/${cycleId}/kickoff/review`}>
            <Button variant="outline">Go to Areas of Focus</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {pairs.map((p, i) => (
            <div key={i} dir={isRtl ? "rtl" : "ltr"}>
              <AreaConceptCard
                index={i}
                area={p.area}
                message={p.message}
                roleGroup={`summary-${cycleId}`}
                readOnly
                onAreaChange={noop}
                onMessageChange={noop}
                onRoleChange={noop}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
