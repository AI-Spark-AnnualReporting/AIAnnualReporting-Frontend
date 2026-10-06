"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import {
  pmApi, AreaOfFocus, ConceptMessage, CycleBriefFields, GenerateBriefAnswer,
  roleSelectionSaveable, MIN_SELECTED_AREAS, MAX_SELECTED_AREAS,
} from "@/lib/api/pm"
// Two different questions: "will this save" (used when persisting an edit) and
// "has a choice been made" (used to gate kickoff). See lib/areasOfFocus.
import {
  roleSelectionComplete,
  MAX_AREAS_ON_PAGE,
  MIN_AREAS_ON_PAGE,
} from "@/lib/areasOfFocus"
import { readKickoffAnswers, consumeKickoffTrigger } from "@/lib/kickoffBriefStorage"
import { PageLoader } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { ProsePreview } from "@/components/ui/prose-preview"
import { KickoffStepper } from "@/components/pm/kickoff-stepper"
import {
  useApproveShare,
  useCycleShares,
  useGenerateAreas,
  useSendBackShare,
} from "@/hooks/useShare"
import type { ShareRequest, ShareStage } from "@/lib/api/share"
import type { LucideIcon } from "lucide-react"
import {
  KickoffBuildLoader, AREAS_REFRESH_LOADER, BRIEF_LOADER, BRIEF_ONLY_LOADER,
  BRIEF_SIGNOFF_LOADER,
} from "@/components/pm/kickoff-build-loader"
import { AreaConceptCard } from "@/components/report/AreaConceptCard"
import { ShareWithClientButton } from "@/components/pm/ShareWithClientButton"
import { KickoffLoader } from "@/components/pm/kickoff-loader"
import { ClientDriftNotice } from "@/components/pm/ClientDriftNotice"
import { useAuth } from "@/contexts/AuthContext"
import { driftSinceResponse } from "@/lib/shareDrift"
import { ApproveDeadlineDialog } from "@/components/pm/approve-deadline-dialog"
import { cn, formatDate } from "@/lib/utils"
import { toast } from "sonner"
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Clock, Eye, Info, Loader2, MailCheck, Megaphone,
  MessageSquareQuote, Pencil, Plus, RefreshCw, Send, ShieldAlert, Sparkles, Target,
  Undo2,
} from "lucide-react"

// Quick-instruction chips — identical to typing the same text into the box.
const BRIEF_CHIPS = ["Make it more concise", "Strengthen ESG focus", "More formal tone", "Add a growth angle"]

// The areas of focus are derived from the brief, so a refined brief leaves them
// stale. There's no "regenerate areas from the brief" endpoint — areas-of-focus/
// refine is the one that rewrites the whole list, so the new brief is handed to
// it in the instruction rather than relying on it to re-read the stored cycle.
// Every action that invalidates work already on screen asks first. One dialog,
// three sets of copy — the wording has to name what specifically gets thrown
// away, or "are you sure?" just trains people to click through it.
interface ConsentCopy {
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  variant: "default" | "destructive"
}

// Asked on Save — the one point where brief changes (typed or AI-refined) reach
// the areas of focus. Saving and regenerating are one action: cancelling backs
// out of both and leaves the edit sitting unsaved in the box.
/** Same shape the share button uses, kept local rather than exported — one
 *  date in one sentence is not a shared concern. */
const fmtDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : ""

/** One shape for every gate state, so "with the client", "they replied" and
 *  "signed off" are recognisably the same kind of message rather than three
 *  different-looking boxes.
 *
 *  Status only, no buttons: the sticky footer is where the one thing to do
 *  next lives, and a second Approve up here would be two places to look for
 *  the same decision. */
function GateBanner({
  tone,
  icon: Icon,
  title,
  body,
  note,
  compact = false,
  trailing,
}: {
  tone: "amber" | "green" | "indigo"
  icon: LucideIcon
  title: string
  body: string
  /** The client's own words, when they left any. */
  note?: string | null
  /** One line, for a screen whose height has to go to the content below. The
   *  body is dropped — on that screen the footer button already says what to
   *  do — and a long note is cut to one line, opened by clicking it. */
  compact?: boolean
  /** Shown at the end of a compact line — the save indicator, which otherwise
   *  needs a strip of its own. */
  trailing?: React.ReactNode
}) {
  const [noteOpen, setNoteOpen] = useState(false)
  const skin = {
    amber: "border-amber-200 bg-amber-50/60 text-amber-900",
    green: "border-green-200 bg-green-50/60 text-green-900",
    indigo: "border-indigo-200 bg-indigo-50/60 text-indigo-900",
  }[tone]
  const iconSkin = {
    amber: "text-amber-600",
    green: "text-green-600",
    indigo: "text-indigo-600",
  }[tone]
  if (compact) {
    return (
      <div className={cn("rounded-2xl border px-4 py-2", skin)}>
        <div className="flex items-center gap-2 text-sm">
          <Icon className={cn("h-4 w-4 shrink-0", iconSkin)} />
          <p className="shrink-0 font-semibold">{title}</p>
          {note && (
            <button
              type="button"
              onClick={() => setNoteOpen((o) => !o)}
              title={noteOpen ? "Hide their note" : "Read their full note"}
              className="min-w-0 truncate text-start italic opacity-90 hover:underline"
            >
              · &ldquo;{note}&rdquo;
            </button>
          )}
          {trailing && <div className="ms-auto shrink-0">{trailing}</div>}
        </div>
        {note && noteOpen && (
          <p className="mt-2 whitespace-pre-line rounded-lg bg-white/60 px-3 py-2 text-sm italic">
            &ldquo;{note}&rdquo;
          </p>
        )}
      </div>
    )
  }

  return (
    <div className={cn("flex items-start gap-3 rounded-2xl border p-4", skin)}>
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", iconSkin)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {note && (
          <p className="mt-2 whitespace-pre-line rounded-lg bg-white/60 px-3 py-2 text-sm italic">
            &ldquo;{note}&rdquo;
          </p>
        )}
        <p className="mt-1.5 text-sm opacity-90">{body}</p>
      </div>
    </div>
  )
}

const SAVE_BRIEF_CONSENT: ConsentCopy = {
  title: "Saving will also rewrite the areas of focus",
  description:
    "The areas of focus are drawn from the strategic brief, so saving your changes regenerates " +
    "them to match — that replaces their slogans, including any you've written " +
    "by hand. Your Primary and Secondary picks are kept.",
  confirmLabel: "Save & regenerate areas",
  cancelLabel: "Cancel",
  variant: "default",
}

// Same Save, once the bundle has gone to the client: the areas stay exactly as
// they are, so promising a rewrite would be a lie.
const SAVE_BRIEF_ONLY_CONSENT: ConsentCopy = {
  title: "Save your changes to the brief?",
  description:
    "The areas of focus stay as they are. This has already gone to the client, so they " +
    "can no longer be rewritten by AI — edit their slogans by hand if they need to match.",
  confirmLabel: "Save brief",
  cancelLabel: "Cancel",
  variant: "default",
}

const REGENERATE_ALL_CONSENT: ConsentCopy = {
  title: "Start over from the questionnaire?",
  description:
    "This rebuilds the strategic brief AND the areas of focus from your original answers. " +
    "Everything currently on screen is discarded — refinements, manual edits, and your " +
    "Primary/Secondary selection, which you'll need to make again.",
  confirmLabel: "Discard & regenerate",
  cancelLabel: "Keep what I have",
  variant: "destructive",
}

/** Spark's version. In Spark's flow the areas of focus are only written once
 *  the client's brief is approved, so Regenerate rebuilds the brief alone. */
const REGENERATE_BRIEF_CONSENT: ConsentCopy = {
  ...REGENERATE_ALL_CONSENT,
  description:
    "This rebuilds the strategic brief from your original answers. The current brief is " +
    "discarded, including any refinements and manual edits.",
}

const realignAreasInstruction = (brief: string) =>
  "The strategic brief has been rewritten. Update every area of focus so it reflects the " +
  "brief below — reword, replace or drop whatever no longer fits, and keep the same number " +
  "of areas in the same order where they still hold.\n\nUPDATED STRATEGIC BRIEF:\n" +
  brief

/* ────────────────────────────────────────────────────────────────────────────
   STRATEGIC BRIEF & THEMES — Step 2: Review brief

   POST /pm/cycles/{id}/generate-brief is a single synchronous call (no job
   id/polling, ~5-15s — 2-3 sequential LLM calls). The loading screen's step
   list is purely decorative (cycled on a timer), not real progress.

   On mount:
     - A fresh "Generate brief" click from Step 1 leaves a one-shot trigger in
       sessionStorage → auto-fire generation and show the loading screen.
     - Otherwise, fall back to whatever the cycle already has persisted
       (cycle.kickoff_brief / areas_of_focus) so a reload doesn't
       re-run the AI.
     - Neither present → nothing to review; bounce back to Step 1.

   Editing the brief/theme text below is LOCAL ONLY — there is no save
   endpoint yet, so nothing here persists on reload. Refine/Add-theme/Approve
   have no backend yet either and stay disabled.
──────────────────────────────────────────────────────────────────────────── */

interface ReviewResult {
  brief: string
  areas: AreaOfFocus[]
}

// Drives the whole screen with ONE explicit value instead of a react-query
// mutation's isPending — the mutation-on-mount pattern leaves isPending stuck
// after Strict Mode detaches the observer from the in-flight request.
//   idle  → still deciding what to do (cycle data loading)
//   loading → request in flight
//   result  → brief ready
//   soft    → 200 but empty brief (server-side LLM soft failure)
//   error   → hard failure (403/404/network/timeout)
type Phase = "idle" | "loading" | "result" | "soft" | "error"

/** Anything this screen can persist. Two endpoints behind it; the order they
 *  are called in matters — see runSave. */
type SavePayload = {
  strategic_brief?: string
  areas_of_focus?: AreaOfFocus[]
  concept_messages?: ConceptMessage[]
}

type SaveState = "idle" | "saving" | "saved" | "error" | "blocked"

/**
 * Screens 2 and 3 of the kickoff wizard, which are one component on purpose.
 *
 * They show different halves of the same thing -- the brief, then the areas of
 * focus written from it -- but they share nearly all of their machinery: the
 * cycle query, the debounced save, the re-sync that pulls the stored version
 * back after a client responds, and both share rows. Splitting them into two
 * page files would have meant two copies of that, kept in step by hand.
 *
 * So the route decides which half to render, and nothing else differs.
 */
export function KickoffDirectionScreen({
  id,
  step,
}: {
  id: string
  /** 2 = the strategic brief. 3 = the areas of focus and concept messages. */
  step: 2 | 3
}) {
  const router = useRouter()
  const qc = useQueryClient()
  const {
    data: pmData,
    isLoading: cycleLoading,
    isFetching: cycleFetching,
  } = usePMCycleDashboard(id)
  // No share button here — the brief and areas go out as part of the step-3
  // bundle. But every save on this screen 409s while that bundle is with the
  // client, so the screen has to say so rather than fail on click.
  const { data: shares, isLoading: sharesLoading } = useCycleShares(id)
  const approveShare = useApproveShare(id)
  const sendBackShare = useSendBackShare(id)
  const generateAreas = useGenerateAreas(id)

  // The list scrolls inside its card, so a new area lands below the fold and
  // the PM had to go looking for what they just added. Set by addArea, read
  // once the new card has rendered.
  const areasListRef = useRef<HTMLDivElement>(null)
  const revealNewestArea = useRef(false)
  const [generatingMessages, setGeneratingMessages] = useState(false)

  /** Write the concept messages for areas that already have none.
   *
   *  Approving the brief generates both halves; if the second failed, the
   *  areas are here and the messages are not, and the footer refuses kickoff
   *  without them. Nothing else on this page can produce them. */
  const generateMessages = async () => {
    setGeneratingMessages(true)
    try {
      const concepts = await pmApi.generateConceptMessages(id)
      setMessages(concepts.concept_messages ?? [])
      toast.success("Concept messages generated.")
    } catch {
      toast.error("Couldn't generate the concept messages. Try again.")
    } finally {
      setGeneratingMessages(false)
    }
  }
  // Holds the stage, not just open/closed: this dialog serves both gates and
  // was hardcoded to "brief", so sending the AREAS back aimed at the brief.
  const [sendBackStage, setSendBackStage] = useState<ShareStage | null>(null)
  const [sendBackNote, setSendBackNote] = useState("")
  // The client sign-off belongs to spark_internal — the only role that can
  // send a link, approve a response or chase one. For every other role the
  // share does not exist on this screen: no button, none of the locks, and
  // the primary/secondary choice goes back to being the PM's own, because
  // there is no client coming to make it. The server skips the same gates.
  const { user } = useAuth()
  const sparkFlow = user?.role === "spark_internal"
  // Not loaded is not the same as "no share". The cycle and the shares come
  // from two separate requests; until the shares arrive, every gate reads as
  // never-shared — which sent people on step 3 back to step 2 for a brief that
  // was already approved, and showed step 2 with "Share with client" and
  // Regenerate for a gate that was closed.
  const sparkSharesPending = sparkFlow && sharesLoading
  const briefShare = sparkFlow ? shares?.brief : undefined
  const areasShare = sparkFlow ? shares?.areas : undefined

  // ── Gate 1: the strategic brief, out on its own ──
  const briefAwaiting = briefShare?.status === "pending"
  const briefShared = !!briefShare
  const briefNeedsApproval = briefShare?.status === "responded"
  // Settled. The areas of focus were written FROM this brief at the moment it
  // was approved, so letting it change afterwards would leave them describing
  // a document that no longer exists. The server refuses the save too.
  const briefLocked = briefShare?.status === "approved"
  // Read-only for either reason: the client holds it, or it is signed off.
  const briefFrozen = briefAwaiting || briefLocked

  // ── Gate 2: the areas of focus and their concept messages ──
  const areasAwaiting = areasShare?.status === "pending"
  // Once this has gone out, AI rewrites are over — the server refuses them.
  const areasShared = !!areasShare
  const areasNeedsApproval = areasShare?.status === "responded"
  const areasApproved = areasShare?.status === "approved"

  // In Spark's flow the areas do not exist until the brief is signed off —
  // approving it is what commissions them. Every other role generates them
  // with the brief as they always did, so the section is simply always there.
  // The split exists because Spark's flow has two client gates: the brief is
  // signed off, and only then are the areas written from it. A client-company
  // PM has no gates, nothing to wait between, and no reason to click through
  // two screens for work produced in one go — so for them both halves stay on
  // one screen, exactly as before this feature.
  const splitScreens = sparkFlow
  const showBrief = step === 2
  const showAreas = splitScreens ? step === 3 : step === 2
  // Only Spark's step 3 is a single-card screen that can fit the window.
  const fitScreen = splitScreens && step === 3

  const areasVisible = !sparkFlow || briefLocked

  // Step 3 has nothing to show until approving the brief has written it.
  // Bounced rather than rendered empty — the message says what to do, where a
  // blank screen would only say that something is wrong.
  // Non-Spark never has a step 3 to land on, so an old bookmark goes back to
  // the one screen that holds everything.
  const strandedOnStepThree =
    step === 3 &&
    !cycleLoading &&
    !sparkSharesPending &&
    (!splitScreens || !briefLocked)
  useEffect(() => {
    if (!strandedOnStepThree) return
    if (splitScreens) {
      toast.info("Approve the brief first — that's what writes the areas of focus.")
    }
    router.replace(`/pm/cycles/${id}/kickoff/review`)
  }, [strandedOnStepThree, splitScreens, router, id])

  const [phase, setPhase] = useState<Phase>("idle")
  // The concept messages moved here from their own screen: one per area, shown
  // inside that area's card, written in the same run as the brief.
  const [messages, setMessages] = useState<ConceptMessage[] | null>(null)
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [errorStatus, setErrorStatus] = useState<number | undefined>(undefined)
  // The answers last used to generate — kept so "Regenerate" can resend them.
  // null means we only have a persisted result with no answers to resend.
  const answersRef = useRef<GenerateBriefAnswer[] | null>(null)
  // Guards the mount effect against React 18 Strict Mode's double-invoke and
  // against re-running once the cycle query refetches.
  const initRef = useRef(false)
  // Bumped on each generate so a stale in-flight request can't overwrite the
  // state of a newer one (e.g. a fast Regenerate after a slow first call).
  const runSeq = useRef(0)

  const cycle = (pmData as { cycle?: CycleBriefFields } | undefined)?.cycle

  // Calls the API directly (not via a react-query mutation) so the loading /
  // result / error state is fully owned locally and immune to observer
  // lifecycle quirks. Still busts the cycle cache so persisted fields refresh.
  const runGenerate = async (answers: GenerateBriefAnswer[]) => {
    const seq = ++runSeq.current
    setPhase("loading")
    try {
      const data = await pmApi.generateBrief(id, { answers })
      if (seq !== runSeq.current) return // superseded by a newer run
      qc.invalidateQueries({ queryKey: ["pm", "cycle", id] })
      if (!data.strategic_brief?.trim()) {
        setPhase("soft")
        return
      }
      const areasBack = data.areas_of_focus ?? []
      setResult({ brief: data.strategic_brief, areas: areasBack })
      setBriefDirty(false) // whatever was typed is gone with the old brief

      // A message is written FOR an area, so with no areas there is nothing to
      // write. Spark's generate-brief deliberately returns none — approving
      // the client's brief is what commissions them — so asking here would be
      // a round trip that can only come back empty.
      if (areasBack.length === 0) {
        setMessages([])
      } else {
        // Written from the areas that just came back, in the same run: the
        // client is shown both at once, so producing them on a later screen
        // only meant a second wait and a partial share.
        try {
          const concepts = await pmApi.generateConceptMessages(id)
          if (seq !== runSeq.current) return
          setMessages(concepts.concept_messages ?? [])
        } catch (err) {
          // A failure here is not a failed brief. Land on the page with the
          // brief intact and a Generate button on the empty messages.
          console.error("[concept-messages] generation failed", err)
          setMessages([])
        }
      }
      setPhase("result")
    } catch (err) {
      if (seq !== runSeq.current) return
      console.error("[generate-brief] failed", err)
      setErrorStatus((err as { status?: number } | null)?.status)
      setPhase("error")
    }
  }

  useEffect(() => {
    if (initRef.current || cycleLoading) return
    initRef.current = true

    const pendingAnswers = readKickoffAnswers(id)
    const shouldAutoGenerate = consumeKickoffTrigger(id)

    if (shouldAutoGenerate && pendingAnswers && pendingAnswers.length > 0) {
      answersRef.current = pendingAnswers
      runGenerate(pendingAnswers)
      return
    }
    if (cycle?.kickoff_brief?.trim()) {
      answersRef.current = pendingAnswers // available for Regenerate if present
      setResult({
        brief: cycle.kickoff_brief,
        areas: cycle.areas_of_focus ?? [],
      })
      pmApi
        .getConceptMessages(id)
        .then((d) => setMessages(d.concept_messages ?? []))
        .catch((err) => {
          console.error("[concept-messages] load failed", err)
          setMessages([])
        })
      setPhase("result")
      return
    }
    // Nothing pending and nothing persisted — there's nothing to review.
    router.replace(`/pm/cycles/${id}/kickoff`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleLoading])


  // Asked only from the result screen — in the error/soft states this button is
  // "Try again" and there is nothing on screen to lose.
  const handleRegenerate = async () => {
    if (!answersRef.current) return
    // The one guard that covers every way in — the footer button and both
    // "Try again" panels. Regenerating rewrites the brief, the areas AND every
    // concept message, so it is gone from the first share onwards and the
    // server refuses it too.
    if (briefShared) return
    const consent = sparkFlow ? REGENERATE_BRIEF_CONSENT : REGENERATE_ALL_CONSENT
    if (phase === "result" && !(await askConsent(consent))) return
    runGenerate(answersRef.current)
  }

  // ── Refine with AI (brief + themes) ──────────────────────────────────────
  // Each call sends the CURRENT on-screen content (with any unsaved edits) + a
  // free-text instruction; the response is the complete revised version, already
  // saved server-side. Returns true so the assistant clears its input on success.
  // Brief view mode: rendered markdown by default (bullets/formatting show
  // styled), or a raw textarea for editing. The stored value stays plain text.
  const [briefEditing, setBriefEditing] = useState(false)
  // Unsent typing in the brief textarea. Cleared wherever the brief is written
  // to the server or replaced by it (save, refine, regenerate).
  const [briefDirty, setBriefDirty] = useState(false)
  const [briefRefineOpen, setBriefRefineOpen] = useState(false)
  const [briefRefining, setBriefRefining] = useState(false)
  const [themesRefining, setThemesRefining] = useState(false)


  // Manual-edit persistence state (used by the edit handlers + refine cancel).
  // "blocked" = edits are held locally because the areas-of-focus selection is
  // half-made and the server would 422 it.
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelPendingSave = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    pendingSave.current = {}
  }

  /* ── Re-seed when the cycle changes underneath us ──────────────────────────
     The effect above runs ONCE. If its first render was served from a cached
     cycle — which is exactly what happens when Spark opens this page, shares
     it, and comes back after the client has submitted — the page keeps that
     stale copy for the rest of the session. The client's new area never
     appears, their trimmed brief still reads long, and the "you've changed
     this" banner fires because it is comparing their response against OUR
     stale copy rather than against the cycle.

     So: whenever the stored brief or areas differ from what is on screen,
     take the stored version. Skipped while anything is unsaved, or a refetch
     landing mid-sentence would delete what is being typed. */
  const seededRef = useRef("")
  useEffect(() => {
    if (!initRef.current || phase !== "result" || !cycle) return
    if (briefDirty || saveTimer.current) return
    // Approval writes the areas and THEN the messages. A cycle refetch landing
    // between the two would seed empty messages and latch the signature, so
    // the later write never re-syncs — areas on screen, "no concept message
    // yet" underneath. Hold off until the whole thing has landed.
    if (approveShare.isPending) return
    // Same latch, from our own saves. Adding or removing an area saves the
    // areas, then the messages, as two calls — and the server CLEARS the
    // messages when the area count changes, so between the two the cycle has
    // areas and no messages. The cycle is polled every 5s; a poll landing in
    // that gap read "no messages", seeded the new signature, and never looked
    // again once the second call put them back. Debounced saves were already
    // covered by saveTimer; an immediate one (add, delete) was not.
    if (saveState === "saving") return
    // And never from a copy that is about to be replaced. Right after a
    // generate the cache still holds the cycle from BEFORE it (no brief) while
    // the refetch is in flight; syncing from that blanked the brief that had
    // just been shown, until the refetch landed and put it back.
    if (cycleFetching) return

    const signature = JSON.stringify([cycle.kickoff_brief, cycle.areas_of_focus])
    if (signature === seededRef.current) return
    seededRef.current = signature

    const brief = cycle.kickoff_brief ?? ""
    const areas = cycle.areas_of_focus ?? []
    const takeAreas = () =>
      setResult((prev) => {
        if (!prev) return prev
        const unchanged =
          prev.brief === brief && JSON.stringify(prev.areas) === JSON.stringify(areas)
        return unchanged ? prev : { brief, areas }
      })

    // The messages come from their own call, so they go stale the same way —
    // and both halves have to land in the SAME render. Refreshing the areas
    // first leaves the page holding new areas beside old messages, and the
    // "you've changed this" banner flashes against that half-updated state.
    pmApi
      .getConceptMessages(id)
      .then((d) => {
        takeAreas()
        setMessages(d.concept_messages ?? [])
      })
      .catch(() => {
        // A failed refresh is not a reason to blank anything; take the areas
        // and leave the messages as they are.
        takeAreas()
      })

    // The share is the OTHER half of the "have we changed this?" comparison,
    // and it is its own query on a 60s poll. Left alone it holds the previous
    // response while the cycle already carries the newest one, and the banner
    // then reports a difference between two copies taken at different moments.
    qc.invalidateQueries({ queryKey: ["pm", "cycle", id, "shares"] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle, phase, briefDirty, saveState, cycleFetching])

  // Returns the refined brief so the caller can feed it straight into the areas
  // regeneration; null on failure.
  const refineBriefWith = async (instruction: string): Promise<string | null> => {
    if (!result || briefRefining) return null
    cancelPendingSave() // refine persists authoritatively — drop any stale save
    setBriefRefining(true)
    try {
      const data = await pmApi.refineBrief(id, { strategic_brief: result.brief, instruction })
      const refined = data.strategic_brief ?? ""
      const changed = refined.trim() !== result.brief.trim()
      if (!changed) toast.info("No changes were applied.")
      setResult((prev) => (prev ? { ...prev, brief: refined } : prev))
      // The endpoint persists the brief itself, so this isn't "unsaved" in the
      // usual sense — it marks that the brief has moved on from the one the
      // areas of focus were built from, which is what Save resolves.
      if (changed) setBriefDirty(true)
      qc.invalidateQueries({ queryKey: ["pm", "cycle", id] }) // already saved
      return refined
    } catch (err) {
      toast.error((err as { message?: string })?.message || "Couldn't refine the brief.")
      return null
    } finally {
      setBriefRefining(false)
    }
  }

  // ── Consent gate ─────────────────────────────────────────────────────────
  // Refining the brief also rewrites the areas of focus, which throws away any
  // wording the PM has already edited by hand — so it's asked for up front. The
  // resolver is held while the dialog is open, which keeps the assistant's
  // submit awaiting: cancelling leaves the typed instruction in the box.
  const [consent, setConsent] = useState<ConsentCopy | null>(null)
  const consentResolve = useRef<((ok: boolean) => void) | null>(null)

  const askConsent = (copy: ConsentCopy) =>
    new Promise<boolean>((resolve) => {
      consentResolve.current = resolve
      setConsent(copy)
    })

  const answerConsent = (ok: boolean) => {
    setConsent(null)
    consentResolve.current?.(ok)
    consentResolve.current = null
  }

  // Refining only drops the new text into the brief box. It does NOT touch the
  // areas of focus — the PM reads the result, keeps editing if they want, and
  // Save is the single point where the areas are brought back in line.
  const [rewritingAreas, setRewritingAreas] = useState(false)

  const submitBriefRefine = async (instruction: string) =>
    (await refineBriefWith(instruction)) !== null

  // `areaIndex` scopes the instruction to a single area (the per-card "Refine
  // with AI"). The endpoint only accepts the WHOLE list — sending just one area
  // would persist it as the entire set — so the scoping is done in the prompt.
  // Refine is deliberately NOT gated on the selection rules: the PM can reword
  // slogans before picking a primary. The server preserves the roles, so the
  // response is taken as-is rather than re-applying roles locally.
  /** Refine the areas with one instruction. Returns the refined list, or null
   *  if nothing changed — the card needs the area AFTER refining to write a
   *  concept message that matches its new name. */
  const refineAreasWith = async (
    instruction: string,
    areaIndex?: number,
  ): Promise<AreaOfFocus[] | null> => {
    if (!result || themesRefining) return null
    cancelPendingSave()
    setThemesRefining(true)
    try {
      const scoped =
        areaIndex === undefined
          ? instruction
          : `Only modify area of focus ${areaIndex + 1}` +
            (result.areas[areaIndex]?.slogan ? ` ("${result.areas[areaIndex].slogan}")` : "") +
            `: ${instruction}. Leave every other area exactly as it is, in the same order.`
      const data = await pmApi.refineAreasOfFocus(id, {
        areas_of_focus: result.areas,
        instruction: scoped,
      })
      // A soft failure answers 200 with an EMPTY list — taking it at face value
      // would wipe the PM's areas, so keep what's on screen and say so.
      const refined = data.areas_of_focus ?? []
      if (refined.length === 0) {
        toast.error("Refine came back empty — your areas of focus are unchanged.")
        return null
      }
      setResult((prev) => (prev ? { ...prev, areas: refined } : prev))
      qc.invalidateQueries({ queryKey: ["pm", "cycle", id] }) // already saved
      return refined
    } catch (err) {
      toast.error((err as { message?: string })?.message || "Couldn't refine the areas of focus.")
      return null
    } finally {
      setThemesRefining(false)
    }
  }

  // ── Persisting manual edits ──────────────────────────────────────────────
  // Areas of focus autosave: debounced for continuous typing (slogans),
  // immediate for discrete actions (add/delete area, role).
  // The BRIEF deliberately does not — it saves on an explicit button, because
  // saving it also offers to rewrite the areas, and that question can't be
  // asked mid-keystroke. We keep local state as the source of truth and don't
  // overwrite it from the response (which just echoes what we sent) to avoid
  // clobbering an in-progress edit.
  useEffect(() => () => cancelPendingSave(), [])

  // Edits waiting on the debounce timer, merged across fields.
  const pendingSave = useRef<SavePayload>({})

  const runSave = async (payload: SavePayload) => {
    setSaveState("saving")
    try {
      const { concept_messages, ...briefPayload } = payload
      // Areas FIRST. Adding or removing one clears the messages server-side,
      // so writing the messages before the areas would save them and then
      // throw them away in the same breath.
      if (Object.keys(briefPayload).length > 0) {
        await pmApi.saveBriefAndAreas(id, briefPayload)
      }
      if (concept_messages) {
        await pmApi.saveConceptMessages(id, concept_messages)
      }
      setSaveState("saved")
      qc.invalidateQueries({ queryKey: ["pm", "cycle", id] })
    } catch (err) {
      setSaveState("error")
      toast.error((err as { message?: string })?.message || "Couldn't save your changes.")
    }
  }

  const saveNow = (payload: SavePayload) => {
    // Carry any debounced edit along rather than dropping it — an immediate
    // save (add, delete, role) must not swallow the slogan typed a moment ago.
    const merged = { ...pendingSave.current, ...payload }
    cancelPendingSave()
    runSave(merged)
  }

  const saveDebounced = (payload: SavePayload) => {
    setSaveState("saving")
    if (saveTimer.current) clearTimeout(saveTimer.current)
    // MERGE, never replace. Each field saves through its own call, so a second
    // edit inside the 800ms window used to throw the first one away: rename an
    // area, then touch its message, and the rename never left the browser.
    pendingSave.current = { ...pendingSave.current, ...payload }
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      const merged = pendingSave.current
      pendingSave.current = {}
      runSave(merged)
    }, 800)
  }

  // Typing is local only — nothing reaches the server until Save.
  const updateBrief = (value: string) => {
    setResult((prev) => (prev ? { ...prev, brief: value } : prev))
    setBriefDirty(true)
  }

  const saveBriefEdit = async () => {
    if (!result || !briefDirty || saveState === "saving") return
    const brief = result.brief
    // Both consent messages are about what saving does to the AREAS OF FOCUS.
    // Before they exist -- Spark's flow, where approving the brief is what
    // writes them -- nothing is derived from this text, so there is nothing to
    // warn about and nothing to consent to. Asking anyway meant showing the
    // "this has already gone to the client" copy to someone who had just
    // generated the brief and shared it with nobody.
    // Realigning is an AI rewrite, closed off from the first share onwards.
    const willRealign = !areasShared && areas.length > 0
    if (areas.length > 0) {
      // Cancel backs out of the whole thing — the edit stays in the box, unsaved.
      if (!(await askConsent(willRealign ? SAVE_BRIEF_CONSENT : SAVE_BRIEF_ONLY_CONSENT)))
        return
    }
    // Only when something is actually being realigned. This loader covers the
    // whole screen and says "updating areas of focus", so raising it for a
    // plain save announced work that was never going to happen -- and before
    // the areas exist at all, work that could not have.
    if (willRealign) setRewritingAreas(true)
    try {
      await runSave({ strategic_brief: brief })
      setBriefDirty(false)
      setBriefEditing(false)
      // Realigning the areas is an AI rewrite, and those are gone once the
      // client has seen this — the server refuses it. Without this check the
      // save succeeds and then throws a red toast on top of it.
      if (willRealign) {
        await refineAreasWith(realignAreasInstruction(brief))
      }
    } finally {
      setRewritingAreas(false)
    }
  }

  // The server rejects a half-made choice with a 422, so a save is only fired
  // once the list is persistable. While it isn't, edits stay local and the
  // indicator says so — the next valid change sends the WHOLE list, which
  // carries those earlier edits with it.
  /**
   * Persist the areas, and the messages too when the pairing moved.
   *
   * `nextMessages` is not optional decoration: the server throws every concept
   * message away whenever the NUMBER of areas changes, because position is the
   * only link between the two lists and it cannot tell which message lost its
   * area. Saving the areas alone on an add or a delete therefore wipes the set
   * — silently, since the page still holds them in memory and looks fine until
   * a reload. Sending both together hands the server the new pairing, and
   * runSave already writes them in the order that survives.
   */
  const commitAreas = (
    next: AreaOfFocus[],
    immediate: boolean,
    nextMessages?: ConceptMessage[],
  ) => {
    setResult((prev) => (prev ? { ...prev, areas: next } : prev))
    if (!roleSelectionSaveable(next)) {
      cancelPendingSave()
      setSaveState("blocked")
      return
    }
    const payload: SavePayload = { areas_of_focus: next }
    if (nextMessages) payload.concept_messages = nextMessages
    if (immediate) saveNow(payload)
    else saveDebounced(payload)
  }

  const areas = result?.areas ?? []
  // Kickoff refuses an incomplete selection, and the client is the one who
  // makes it — so this is a check on THEIR answer, not a control here.
  const areaChoiceValid = roleSelectionComplete(areas)
  // Approve needs a COMPLETE choice — "everything untouched" is persistable but
  // is not a decision, so it can't move the cycle forward.
  // Enough areas to BE a choice — not the choice itself, which the client
  // makes on their own link. Below the minimum they couldn't mark the required
  // number however they picked.
  const areaSelectionValid = areas.length >= MIN_SELECTED_AREAS

  const addArea = () => {
    if (!result || areasShared || areas.length >= MAX_AREAS_ON_PAGE) return
    // Only where the list is its own scroll box (Spark's step 3). Elsewhere the
    // page scrolls normally and the new card lands where it always did.
    if (fitScreen) revealNewestArea.current = true
    // Areas and messages stay parallel, so a new card gets an empty message
    // beside it rather than shifting every existing pairing along. Both go to
    // the server in one save — see commitAreas.
    const nextMessages: ConceptMessage[] = [
      ...list,
      { title: "", description: "", role: "secondary" },
    ]
    setMessages(nextMessages)
    commitAreas(
      [...areas, { slogan: "", sub_slogans: [], role: "none" }],
      true,
      nextMessages,
    )
  }

  useEffect(() => {
    if (!revealNewestArea.current) return
    revealNewestArea.current = false
    const list = areasListRef.current
    if (!list) return
    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" })
    const name = list.querySelector<HTMLInputElement>(
      `input[aria-label="Area of focus ${areas.length}"]`,
    )
    // preventScroll: the list is already gliding there; focusing normally would
    // snap it instantly and cut the animation short.
    name?.focus({ preventScroll: true })
  }, [areas.length])

  const deleteArea = (idx: number) => {
    if (!result || areasShared || areas.length <= MIN_AREAS_ON_PAGE) return
    const nextMessages = list.filter((_, i) => i !== idx)
    setMessages(nextMessages)
    commitAreas(
      areas.filter((_, i) => i !== idx),
      true,
      nextMessages,
    )
  }

  // ── Approve & kickoff ────────────────────────────────────────────────────
  // Moved here with the concept messages: this is the last screen of the
  // wizard now, so it owns the deadline modal and the kickoff pipeline.
  const todayIso = new Date().toISOString().slice(0, 10)
  const [approveOpen, setApproveOpen] = useState(false)
  const [deadlineInput, setDeadlineInput] = useState("")
  const [numQuestions, setNumQuestions] = useState(12)
  const [approving, setApproving] = useState(false)

  const deadlineValid = !!deadlineInput && deadlineInput >= todayIso
  const approveValid = deadlineValid && numQuestions >= 5 && numQuestions <= 20

  const openApprove = () => {
    setDeadlineInput(cycle?.questions_deadline?.slice(0, 10) ?? "")
    setApproveOpen(true)
  }

  const confirmApprove = async () => {
    if (!approveValid || !result?.brief || approving) return
    setApproving(true)
    try {
      // Sign the client's version off first — kickoff 409s without it, and
      // doing it here keeps it to one button. The AREAS gate is the last one;
      // the brief was approved earlier, which is what built these.
      if (areasNeedsApproval) await approveShare.mutateAsync("areas")

      // The long call (~up to 3 min): every department's questions.
      await pmApi.submitKickoff({
        cycle_id: id,
        strategic_brief: result.brief,
        num_questions: numQuestions,
      })

      // Non-blocking: kickoff already succeeded, so a deadline failure warns
      // rather than rolls anything back.
      try {
        await pmApi.setQuestionsDeadline(id, deadlineInput)
      } catch {
        toast.error("Questions generated, but the deadline couldn't be saved — set it from the cycle page.")
      }

      qc.invalidateQueries({ queryKey: ["pm", "cycle", id] })
      toast.success(`Kickoff complete — departments must answer by ${formatDate(deadlineInput)}.`)
      setApproveOpen(false)
      router.push(`/pm/cycles/${id}`)
    } catch (err) {
      // A timeout aborts here while the backend is very likely still going.
      // Resubmitting would fire a DUPLICATE kickoff, so don't re-enable.
      const msg = (err as { message?: string })?.message ?? ""
      if (/timeout|ECONNABORTED/i.test(msg)) {
        toast.message("Questions may still be generating — check the cycle dashboard in a moment.")
        setApproveOpen(false)
        router.push(`/pm/cycles/${id}`)
        return
      }
      toast.error(msg || "Couldn't kick off the cycle.")
      setApproving(false)
    }
  }

  // ── Concept messages ─────────────────────────────────────────────────────
  // One per area, saved together with the areas. Areas go first: adding or
  // removing one clears the messages server-side, so writing them the other
  // way round would throw the edit away.
  const list = messages ?? []
  // null means NOT LOADED YET, which is not the same as "none were written".
  // The areas arrive instantly from the cached cycle while the messages need a
  // round trip, so reading null as [] fired the "weren't written" card on
  // every arrival at the areas screen — for messages that were sitting in the
  // database the whole time.
  const messagesLoaded = messages !== null

  const editMessages = (next: ConceptMessage[]) => {
    setMessages(next)
    saveDebounced({ concept_messages: next })
  }

  const refineMessage = async (
    instruction: string,
    index: number,
    area?: AreaOfFocus,
  ) => {
    if (areasShared) return false
    const message = list[index]
    // An area you added arrives with an EMPTY message. "Only modify message 4"
    // then asks the AI to rewrite nothing, and nothing is what comes back — so
    // for an empty one the instruction is to write it, from the area it
    // belongs to. Same endpoint: it takes the whole set and returns it.
    const empty = !message?.title?.trim() && !message?.description?.trim()
    try {
      // The endpoint rewrites the WHOLE set, so the instruction has to say
      // which one to touch — same scoping the concept screen used.
      const scoped = empty
        ? `Concept message ${index + 1} is empty — write it from scratch` +
          (area?.slogan ? ` for the area of focus "${area.slogan}"` : "") +
          (area?.summary ? ` (${area.summary})` : "") +
          ": a two-word title and three paragraphs, in the same voice and at the " +
          "same length as the other messages" +
          (instruction.trim() ? `, and ${instruction}` : "") +
          ". Leave every other message exactly as it is, in the same order."
        : `Only modify concept message ${index + 1}` +
          (message?.title ? ` ("${message.title}")` : "") +
          `: ${instruction}. Leave every other message exactly as it is, in the same order.`
      const data = await pmApi.refineConceptMessages(id, {
        concept_messages: list,
        instruction: scoped,
      })
      setMessages(data.concept_messages ?? list)
      return true
    } catch (err) {
      toast.error((err as { message?: string })?.message || "Couldn't refine that message.")
      return false
    }
  }

  // One Refine button on the card drives both halves of it. The area names the
  // idea and the message tells it at length, so "make it punchier" applied to
  // only one of them leaves a slogan that no longer matches its message.
  //
  // Area FIRST, and not for cosmetic reasons: the concept-message refiner
  // re-reads the cycle's areas to stamp each message's area_slogan, so running
  // it second is what makes the message pick up the new name. Reversed, the
  // message would be stamped with the slogan it is replacing.
  const refineCard = async (instruction: string, index: number) => {
    if (areasShared) return false
    const refinedAreas = await refineAreasWith(instruction, index)
    // The area as it stands NOW — the refine may have renamed it, and a
    // message written for the old name would describe the wrong thing.
    const area = (refinedAreas ?? areas)[index]
    // With no slot at all (fewer messages than areas) asking the refiner for
    // message N invites it to invent one out of order, so that case is left.
    const messageRefined = list[index]
      ? await refineMessage(instruction, index, area)
      : false
    // Either half landing is a result worth keeping on screen. Both failing
    // has already raised its own toast.
    return !!refinedAreas || messageRefined
  }

  // What Spark has changed since the client sent this back. Empty until they
  // respond, and empty again once it is signed off — after that the cycle IS
  // the approved version.
  // What Spark has changed since the client sent it back — per gate, because
  // each one carries only its own half and drift is compared field by field.
  const seen = (share?: ShareRequest | null) =>
    share?.status === "responded" || share?.status === "approved"

  const briefDrifted =
    seen(briefShare) && briefShare
      ? driftSinceResponse(briefShare.response, {
          strategic_brief: result?.brief,
        }).length > 0
      : false
  const areasDrifted =
    seen(areasShare) && areasShare
      ? driftSinceResponse(areasShare.response, {
          areas_of_focus: areas,
          concept_messages: list,
        }).length > 0
      : false

  // Per screen: "you've changed this since they sent it" has to mean the thing
  // in front of you. On the areas screen, drift in the brief is both invisible
  // and unfixable — it is settled by then.
  const changedSinceResponse = showAreas ? areasDrifted : briefDrifted

  // Their note likewise belongs to the gate being looked at. The brief screen
  // showing the note they wrote about the AREAS, or vice versa, attributes a
  // comment to work it was never about.
  const screenShare = showAreas ? areasShare : briefShare

  // Prefer the cycle's actual name; fall back to a fiscal-year label only if
  // the name is missing.
  const fiscalLabel =
    cycle?.cycle_name ??
    (cycle?.fiscal_year ? `FY${cycle.fiscal_year} Annual Report` : "Annual Report")

  const wordCount = result?.brief.trim() ? result.brief.trim().split(/\s+/).length : 0

  const hardError = errorStatus

  if (phase === "idle" || sparkSharesPending) return <PageLoader />

  return (
    <div
      // Spark's step 3 fits the window exactly, so the shell has nothing to
      // scroll and the areas list is the ONE scrollbar. 136px = the 72px top
      // bar + the shell's 2rem top and bottom padding (AppShell, PM branch).
      // Every other screen scrolls the page as normal — non-Spark roles keep
      // the brief and areas on one screen, which can't fit a window anyway.
      className={cn(fitScreen && "flex h-[calc(100dvh-136px)] flex-col")}
    >
      <div className={cn(fitScreen ? "flex min-h-0 flex-1 flex-col space-y-3" : "space-y-6")}>
        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Link href={`/pm/cycles/${id}/kickoff`}>
              <Button variant="outline" size="icon" className="mt-0.5 h-9 w-9 shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            {fitScreen ? (
              // One line on step 3: "Cycle setup" and the long subtitle restate
              // what the stepper below already says, and this row is fixed — its
              // height comes straight out of the scrolling list.
              <div className="flex min-h-9 items-baseline gap-2">
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  Strategic Direction
                </h1>
                <span className="text-sm text-muted-foreground">{fiscalLabel}</span>
              </div>
            ) : (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Cycle Setup
                </p>
                <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-foreground">
                  Strategic Direction
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {fiscalLabel} · The brief, the areas of focus and the message behind each.
                </p>
              </div>
            )}
          </div>

          {/* One gate per screen, so one button. The screen showing the brief
              shares the brief; the screen showing the areas shares those. Both
              here at once put an enabled "Share with client" for the AREAS on
              the brief screen, next to the brief's own status — two buttons for
              two different things, reading as one. */}
          {sparkFlow && phase === "result" && showBrief && (
            <ShareWithClientButton
              cycleId={id}
              stage="brief"
              share={briefShare}
              // Whoever answered the questionnaire is the client on this
              // cycle — no reason to make Spark remember the address.
              suggestedEmail={shares?.questionnaire?.client_email}
              // So the dialog can warn when an edit has moved the text away
              // from the version the client actually signed.
              current={{ strategic_brief: result?.brief }}
            />
          )}
          {sparkFlow && phase === "result" && showAreas && (
            <ShareWithClientButton
              cycleId={id}
              stage="areas"
              share={areasShare}
              // The brief gate is the nearest one, and by here it has certainly
              // been sent — these areas came from approving it.
              suggestedEmail={
                briefShare?.client_email ?? shares?.questionnaire?.client_email
              }
              current={{ areas_of_focus: areas, concept_messages: list }}
            />
          )}
        </div>

        {/* On the page as well as in the approve dialog: this is where the
            editing happens, so this is where it should first be said. */}
        <ClientDriftNotice
          changed={changedSinceResponse}
          canSendBack={screenShare?.status !== "approved"}
        />

        {screenShare?.client_note &&
          !(showBrief && briefNeedsApproval) &&
          !(showAreas && areasNeedsApproval) && (
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4">
            <MessageSquareQuote className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">A note from the client</p>
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                {screenShare.client_note}
              </p>
            </div>
          </div>
        )}

        {/* ── Stepper ── */}
        <KickoffStepper current={step} steps={splitScreens ? 3 : 2} compact={fitScreen} />

        {/* ── Gate status ──
            Exactly one, by priority: what needs a decision beats what is
            merely in progress, which beats what is already settled. Three
            boxes competing for the same glance is how "client responded"
            went unnoticed before -- it had no box at all, only a button
            tucked into the header. */}
        {showBrief && briefNeedsApproval ? (
          <GateBanner
            tone="green"
            icon={MailCheck}
            title={`Your client sent the brief back${
              briefShare?.responded_at ? ` · ${fmtDate(briefShare.responded_at)}` : ""
            }`}
            note={briefShare?.client_note}
            body="Everything below is their version. Approve it in the bar at the bottom — that writes the areas of focus and concept messages from this brief, about a minute, and locks it."
          />
        ) : showAreas && areasNeedsApproval ? (
          <GateBanner
            tone="green"
            icon={MailCheck}
            title={`${fitScreen ? "Your client sent this back" : "Your client sent the areas of focus back"}${
              areasShare?.responded_at ? ` · ${fmtDate(areasShare.responded_at)}` : ""
            }`}
            note={areasShare?.client_note}
            body="Everything below is their version, including which area leads the report. Approve &amp; kickoff in the bar at the bottom signs it off, or send it back with a note."
            compact={fitScreen}
            trailing={fitScreen ? <SaveIndicator state={saveState} /> : undefined}
          />
        ) : (showBrief && briefAwaiting) || (showAreas && areasAwaiting) ? (
          <GateBanner
            tone="amber"
            icon={Clock}
            title={
              briefAwaiting
                ? "The brief is with the client right now"
                : "The areas of focus are with the client right now"
            }
            body={
              briefAwaiting
                ? "It's locked until you approve their response — otherwise your edits and theirs would overwrite each other. Approving it is also what writes the areas of focus and concept messages from it."
                : "They're locked until you approve their response — otherwise your edits and theirs would overwrite each other."
            }
            compact={fitScreen}
            trailing={fitScreen ? <SaveIndicator state={saveState} /> : undefined}
          />
        ) : showBrief && briefLocked ? (
          <GateBanner
            tone="green"
            icon={Check}
            title="The brief is signed off"
            body={`Approved ${fmtDate(briefShare?.approved_at)}. The areas of focus below were written from it, so it can't be changed now.`}
          />
        ) : null}


        {/* ── Hard error (403 / 404 / network) ── */}
        {phase === "error" && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5">
            <ShieldAlert className="h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="font-semibold text-red-800">
                {hardError === 403
                  ? "You don't have access to this cycle"
                  : hardError === 404
                    ? "Cycle not found"
                    : "Couldn't generate the brief"}
              </p>
              <p className="mt-0.5 text-sm text-red-700">
                {hardError === 403 || hardError === 404
                  ? "This cycle belongs to a different project manager, or the link is incorrect."
                  : "Something went wrong contacting the server. Try again."}
              </p>
              {answersRef.current && !briefShared && hardError !== 403 && hardError !== 404 && (
                <Button
                  size="sm"
                  onClick={handleRegenerate}
                  className="mt-3 bg-red-600 text-white hover:bg-red-700"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Try again
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── Soft failure (200 with an empty brief) ── */}
        {phase === "soft" && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-800">Brief generation didn&apos;t produce a result</p>
              <p className="mt-0.5 text-sm text-amber-700">
                This can happen occasionally — try again.
              </p>
              {answersRef.current && !briefShared && (
                <Button
                  size="sm"
                  onClick={handleRegenerate}
                  className="mt-3 bg-amber-600 text-white hover:bg-amber-700"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Try again
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── Result ── */}
        {/* Whether a gate banner is up on THIS screen. On step 3 the banner
            carries the save indicator, so the strip below would only repeat it. */}
        {phase === "result" && result && (
          <div className={cn("space-y-4", fitScreen && "flex min-h-0 flex-1 flex-col")}>
            {/* AI-generated notice + save status. Hidden on step 3 while a
                compact gate banner is up: that banner already says whose
                version this is, and carries the save indicator. */}
            {!(fitScreen && (areasNeedsApproval || areasAwaiting)) && (
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-indigo-50 px-4 text-sm font-medium text-indigo-700",
                fitScreen ? "py-2" : "py-3",
              )}
            >
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0" />
                {/* Each screen speaks about its OWN gate. On the areas screen
                    the brief is settled and not even shown, so reporting on it
                    there is noise about something you cannot act on. */}
                {(showBrief && briefNeedsApproval) || (showAreas && areasNeedsApproval)
                  ? "Your client's version — read it, edit anything that isn't right, then approve."
                  : (showBrief && briefAwaiting) || (showAreas && areasAwaiting)
                    ? "With your client. You'll be able to edit again once you approve what they send back."
                    : showAreas && splitScreens
                      ? "Written from the brief your client signed off — review and edit, then share."
                      : showBrief && briefLocked
                        ? "Signed off with your client."
                        : "AI-generated based on your answers — review and edit, then approve."}
              </span>
              <SaveIndicator state={saveState} />
            </div>
            )}

            {/* Strategic Brief */}
            {showBrief && (
            <div className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                    <Target className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-foreground">Strategic Brief</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      The strategic direction for this cycle&apos;s report.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {briefDirty && (
                    <span className="text-xs font-medium text-amber-600">Unsaved</span>
                  )}
                  {/* Only while there's something to save — an always-visible
                      disabled Save reads as "broken" more than as "nothing to do". */}
                  {briefDirty && (
                    <Button
                      size="sm"
                      onClick={saveBriefEdit}
                      disabled={saveState === "saving" || briefFrozen}
                      className="bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      {saveState === "saving" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Save
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={briefFrozen}
                    onClick={() => setBriefEditing((e) => !e)}
                  >
                    {briefEditing ? (
                      <><Eye className="h-3.5 w-3.5" /> Preview</>
                    ) : (
                      <><Pencil className="h-3.5 w-3.5" /> Edit</>
                    )}
                  </Button>
                  {/* Gone from the first share, like Regenerate and the
                      per-card Refine — it never comes back, so a permanently
                      dead button would just be furniture. Typing stays open. */}
                  {!briefShared && (
                    <Button
                      size="sm"
                      onClick={() => setBriefRefineOpen((o) => !o)}
                      className={cn(
                        "bg-indigo-50 text-indigo-600 hover:bg-indigo-100",
                        briefRefineOpen && "bg-indigo-100 ring-1 ring-indigo-300",
                      )}
                    >
                      <Sparkles className="h-3.5 w-3.5" /> Refine with AI
                    </Button>
                  )}
                  <span className="shrink-0 text-xs text-muted-foreground">{wordCount} words</span>
                </div>
              </div>
              {briefEditing ? (
                <Textarea
                  value={result.brief}
                  readOnly={briefFrozen}
                  onChange={(e) => updateBrief(e.target.value)}
                  rows={10}
                  className="mt-4 text-sm leading-relaxed"
                />
              ) : (
                <div className="mt-4 rounded-lg border bg-muted/20 p-4">
                  <ProsePreview content={result.brief} className="prose-indigo" />
                </div>
              )}
              {/* The same !briefShared as the button above it. Toggling this
                  open and THEN sharing used to leave the panel on screen with
                  its button gone — an AI box the server would 409. */}
              {briefRefineOpen && !briefShared && (
                <RefinePanel
                  chips={BRIEF_CHIPS}
                  loading={briefRefining}
                  onSubmit={submitBriefRefine}
                  placeholder="e.g. make it more concise, strengthen ESG, add a growth angle…"
                />
              )}
            </div>
            )}

            {showAreas && (<>
            {/* ── Waiting on the brief ──
                Spark's flow has no areas of focus until the brief comes back
                signed off — approving it is what writes them. Say so, rather
                than show an empty card the PM would try to fill. */}
            {!areasVisible && (
              <div className="rounded-2xl border border-dashed bg-muted/20 p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Megaphone className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-foreground">Areas of focus</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {briefAwaiting
                        ? "Written once your client sends the brief back and you approve it — so they follow the direction you both agreed."
                        : briefNeedsApproval
                          ? "Your client has sent the brief back. Approving it writes these from their version."
                          : "Share the brief with your client first. Approving what they send back is what writes these."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* The other half of the same failure: areas landed, messages did
                not. The footer refuses kickoff without them and nothing else
                on this page can write them. */}
            {areasVisible && sparkFlow && areas.length > 0 && messagesLoaded &&
              list.length === 0 &&
              !areasShared && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-amber-900">
                        The concept messages weren&apos;t written
                      </p>
                      <p className="mt-0.5 text-sm text-amber-800">
                        Approving the brief should have produced one for each
                        area of focus. Write them now.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={generatingMessages}
                      onClick={generateMessages}
                      className="bg-amber-600 text-white hover:bg-amber-700"
                    >
                      {generatingMessages ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      Generate concept messages
                    </Button>
                  </div>
                </div>
              )}

            {/* ── The rebuild, when approval failed to produce them ──
                approve() cannot be repeated, so without this the PM is stuck
                on an empty card with nothing to press. */}
            {areasVisible && sparkFlow && areas.length === 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-amber-900">
                      The areas of focus weren&apos;t written
                    </p>
                    <p className="mt-0.5 text-sm text-amber-800">
                      Approving the brief should have produced them. Build them
                      now from the brief your client signed off.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={generateAreas.isPending}
                    onClick={() => generateAreas.mutate()}
                    className="bg-amber-600 text-white hover:bg-amber-700"
                  >
                    {generateAreas.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Generate areas of focus
                  </Button>
                </div>
              </div>
            )}

            {/* Areas of Focus */}
            <div
              className={cn(
                "rounded-2xl border bg-card p-5 shadow-sm",
                fitScreen && "flex min-h-0 flex-1 flex-col",
                !areasVisible && "hidden",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                    <Megaphone className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-foreground">Areas of Focus</p>
                    {!fitScreen && (
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        Add, edit or remove areas. The client marks which ones are used
                        and which one leads when you share this with them.
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "text-xs font-medium tabular-nums",
                      areaSelectionValid ? "text-muted-foreground" : "text-amber-600",
                    )}
                  >
                    {areas.length} area{areas.length === 1 ? "" : "s"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={addArea}
                    // How many areas there are is settled at the first
                    // share: they add to the set once, then both sides work
                    // on the same list. The server draws the same line.
                    disabled={areasShared || areas.length >= MAX_AREAS_ON_PAGE}
                    title={
                      areasShared
                        ? "This has already gone to the client — the number of areas is settled"
                        : areas.length >= MAX_AREAS_ON_PAGE
                          ? `At most ${MAX_AREAS_ON_PAGE} areas of focus on the page`
                          : undefined
                    }
                  >
                    <Plus className="h-3.5 w-3.5" /> Add area of focus
                  </Button>
                </div>
              </div>

              {/* Same line the client sees on their link, so both sides learn
                  the rule the same way. Only while there's still a way to act
                  on it — once the areas are shared the count is frozen and
                  deleting is no longer allowed either. */}
              {!areasShared && areas.length >= MAX_AREAS_ON_PAGE && (
                <p className="mt-3 flex items-start gap-1.5 text-xs font-medium text-indigo-700">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {MAX_AREAS_ON_PAGE} is the maximum. To add your own, delete one
                    first.
                  </span>
                </p>
              )}

              {!areaSelectionValid && areas.length > 0 && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  Keep at least {MIN_SELECTED_AREAS} areas of focus — the client has to be
                  able to mark that many.
                </p>
              )}

              {/* The list scrolls inside the card so the header — the count and
                  "Add area of focus" — stays put, and eight areas with
                  full-length concept messages don't push the footer a long way
                  down the page. Sized to the viewport rather than a fixed pixel
                  height, so a tall screen shows more before it scrolls.
                  Right padding keeps the scrollbar off the cards' edges. */}
              <div
                ref={areasListRef}
                className={cn(
                  "mt-4 space-y-3",
                  // Inner scroll only where the page itself doesn't scroll —
                  // two scrollbars for one list is the thing being removed.
                  fitScreen && "min-h-0 flex-1 overflow-y-auto pr-2",
                )}
              >
                {areas.length === 0 && !sparkFlow && (
                  <p className="text-sm text-muted-foreground">No areas of focus were proposed.</p>
                )}
                {areas.map((area, i) => (
                  <AreaConceptCard
                    key={i}
                    index={i}
                    area={area}
                    // Position is the link: message i belongs to area i.
                    message={list[i]}
                    messageLoading={!messagesLoaded}
                    roleGroup="area-of-focus-primary"
                    readOnly={areasAwaiting}
                    // Primary/secondary is the client's call, made on their own
                    // link. Shown here, never set here.
                    lockRole={sparkFlow}
                    onAreaChange={(next) =>
                      commitAreas(
                        areas.map((a, k) => (k === i ? { ...a, ...next } : a)),
                        false,
                      )
                    }
                    onMessageChange={(next) =>
                      editMessages(list.map((m, k) => (k === i ? { ...m, ...next } : m)))
                    }
                    // Live only when there is no client coming to choose —
                    // lockRole hides the control for Spark, and a no-op here
                    // would leave a PM clicking a toggle wired to nothing.
                    // One primary across the whole list: marking a new one
                    // demotes the old rather than leaving two.
                    onRoleChange={(role) =>
                      commitAreas(
                        areas.map((a, k) =>
                          k === i
                            ? { ...a, role }
                            : role === "primary" && (a.role ?? "none") === "primary"
                              ? { ...a, role: "secondary" }
                              : a,
                        ),
                        true,
                      )
                    }
                    // Same line as Add: the set is fixed from the first
                    // share, and a delete would clear every concept message
                    // with no regenerate left to rebuild them.
                    // Gone at the minimum, not left as a dead click: a report
                    // needs at least two areas, and the server refuses fewer.
                    onRemove={
                      areasShared || areas.length <= MIN_AREAS_ON_PAGE
                        ? undefined
                        : () => deleteArea(i)
                    }
                    // Gone for good once the client has seen this.
                    onRefine={areasShared ? undefined : (ins) => refineCard(ins, i)}
                  />
                ))}
              </div>

            </div>
            </>)}
          </div>
        )}
      </div>

      {/* ── Sticky footer bar ── */}
      <div className="sticky bottom-0 z-10 -mx-8 -mb-8 mt-8 shrink-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center justify-between gap-4 px-8 py-3">
          <Link
            href={
              step === 3
                ? `/pm/cycles/${id}/kickoff/review`
                : `/pm/cycles/${id}/kickoff`
            }
          >
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            {/* Keyed on the BRIEF share, because that is what this rewrites —
                the server gate is assert_never_shared(BRIEF) on generate-brief.
                Gone once shared rather than greyed out: from the first share it
                never comes back, so leaving a dead button in the bar is
                furniture that reads as "broken" every visit. */}
            {step === 2 &&
              (phase === "result" || phase === "soft" || phase === "error") &&
              !briefShared && (
                <Button
                  variant="outline"
                  onClick={handleRegenerate}
                  disabled={!answersRef.current}
                  title={
                    !answersRef.current
                      ? "Answer the questionnaire again to regenerate"
                      : undefined
                  }
                >
                  <RefreshCw className="h-4 w-4" /> Regenerate
                </Button>
              )}

            {/* Send back lives on the page, not only inside the share popup —
                it is one of the two things you do with a response. */}
            {((step === 2 && briefNeedsApproval) ||
              (step === 3 && areasNeedsApproval)) && (
              <Button
                variant="outline"
                disabled={approveShare.isPending}
                onClick={() => setSendBackStage(step === 2 ? "brief" : "areas")}
                className="border-amber-300 text-amber-800 hover:bg-amber-50"
              >
                <Undo2 className="h-4 w-4" /> Send back
              </Button>
            )}

            {/* Spark's step 2 ends with the brief: approve it when the client
                has replied, otherwise carry on to the areas it produced. Every
                other role has one screen holding everything, so theirs ends the
                wizard here exactly as it always did. */}
            {splitScreens && step === 2 ? (
              briefNeedsApproval ? (
                <Button
                  disabled={approveShare.isPending}
                  onClick={() =>
                    approveShare.mutate("brief", {
                      // Both halves exist server-side now. Clearing the seed
                      // forces the sync effect to re-read rather than trusting
                      // a signature that may have latched mid-generation.
                      onSuccess: () => {
                        seededRef.current = ""
                        router.push(`/pm/cycles/${id}/kickoff/concept`)
                      },
                    })
                  }
                  className="bg-green-600 text-white hover:bg-green-700"
                >
                  {approveShare.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {approveShare.isPending
                    ? "Writing the areas of focus…"
                    : "Approve brief"}
                </Button>
              ) : (
                <Link
                  href={`/pm/cycles/${id}/kickoff/concept`}
                  className={cn(!areasVisible && "pointer-events-none")}
                >
                  <Button
                    disabled={phase !== "result" || !areasVisible}
                    title={
                      areasVisible
                        ? undefined
                        : briefAwaiting
                          ? "The brief is with your client"
                          : "Share the brief with your client first"
                    }
                    className="bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    Continue <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              )
            ) : (
              <Button
                disabled={
                  phase !== "result" ||
                  list.length === 0 ||
                  !areaChoiceValid ||
                  (sparkFlow && !(areasApproved || areasNeedsApproval))
                }
                onClick={openApprove}
                title={
                  !messagesLoaded
                    ? undefined
                    : list.length === 0
                      ? "Generate the concept messages first"
                      : !areaChoiceValid
                        ? `The client needs to mark ${MIN_SELECTED_AREAS}-${MAX_SELECTED_AREAS} areas, one leading`
                        : !sparkFlow
                          ? undefined
                          : !areasShare
                            ? "Share the areas of focus with the client first"
                            : areasShare.status === "pending"
                              ? "Waiting on the client's response"
                              : undefined
                }
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                <CheckCircle2 className="h-4 w-4" />
                {areasNeedsApproval ? "Approve & kickoff" : "Approve & use"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Send back — the note that goes with it. Same shape as step 1's, so a
          response is handled the same way wherever you are looking at it. */}
      <Dialog open={!!sendBackStage} onOpenChange={(o) => !o && setSendBackStage(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send this back to the client</DialogTitle>
            <DialogDescription>
              They&apos;ll get an email with your note. Their version stays on the
              page so they can edit rather than start again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              What should they look at?
            </label>
            <Textarea
              value={sendBackNote}
              onChange={(e) => setSendBackNote(e.target.value)}
              rows={4}
              autoFocus
              placeholder="e.g. We tightened area 2 — check you're happy with the new wording."
              className="text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              disabled={sendBackShare.isPending}
              onClick={() => {
                setSendBackStage(null)
                setSendBackNote("")
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={sendBackShare.isPending || !sendBackNote.trim()}
              onClick={() =>
                sendBackShare.mutate(
                  { stage: sendBackStage!, comment: sendBackNote.trim() },
                  {
                    onSuccess: () => {
                      setSendBackStage(null)
                      setSendBackNote("")
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
          </div>
        </DialogContent>
      </Dialog>

      <ApproveDeadlineDialog
        open={approveOpen}
        onOpenChange={(o) => {
          if (approving) return // don't dismiss mid-request
          setApproveOpen(o)
        }}
        value={deadlineInput}
        onChange={setDeadlineInput}
        min={todayIso}
        valid={deadlineValid}
        canApprove={approveValid}
        numQuestions={numQuestions}
        onNumQuestionsChange={setNumQuestions}
        submitting={approving}
        onConfirm={confirmApprove}
        cycleLabel={fiscalLabel}
        changedSinceResponse={changedSinceResponse}
      />

      {/* One dialog for all three destructive paths — refine, manual edit, and
          full regeneration — with the copy carried by whoever asked. */}
      <ConfirmDialog
        open={consent !== null}
        onOpenChange={(open) => {
          if (!open) answerConsent(false)
        }}
        title={consent?.title ?? ""}
        description={consent?.description ?? ""}
        confirmLabel={consent?.confirmLabel ?? "Confirm"}
        cancelLabel={consent?.cancelLabel ?? "Cancel"}
        variant={consent?.variant ?? "default"}
        onConfirm={() => answerConsent(true)}
      />

      {/* Full-screen loader for the initial generation — it writes the brief and
          the first areas of focus in one call. */}
      {/* Spark's run writes the brief alone; everyone else's writes all three. */}
      {phase === "loading" && (
        <KickoffBuildLoader {...(sparkFlow ? BRIEF_ONLY_LOADER : BRIEF_LOADER)} />
      )}

      {/* Full-screen loader while the areas are rewritten against a changed
          brief — same treatment as the other multi-call AI passes. */}
      {rewritingAreas && <KickoffBuildLoader {...AREAS_REFRESH_LOADER} />}
      {/* ~60s, two LLM calls. A spinner inside a footer button is not enough
          signal for the longest wait on the screen. */}
      {approveShare.isPending && <KickoffBuildLoader {...BRIEF_SIGNOFF_LOADER} />}
      {/* Approve & kickoff writes every department's questions — up to ~3
          minutes. A spinner in the dialog's button ("Setting deadline…") was
          the only sign anything was happening, and it named the quickest step
          of the three rather than the one actually taking the time. */}
      {approving && <KickoffLoader />}

    </div>
  )
}

/* ── Save status indicator ───────────────────────────────────────────────── */
function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null
  if (state === "blocked") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
        <ShieldAlert className="h-3.5 w-3.5" /> Not saved — finish the selection
      </span>
    )
  }
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
      </span>
    )
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600">
        <Check className="h-3.5 w-3.5" /> Saved
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
      <ShieldAlert className="h-3.5 w-3.5" /> Save failed
    </span>
  )
}

/* ── Refine-with-AI assistant — chips + free-text instruction ────────────── */
function RefinePanel({
  chips,
  loading,
  onSubmit,
  placeholder,
}: {
  chips: string[]
  loading: boolean
  // Returns true on success so the input clears; false leaves the text intact.
  onSubmit: (instruction: string) => Promise<boolean>
  placeholder: string
}) {
  const [text, setText] = useState("")

  const submit = async (instruction: string) => {
    const value = instruction.trim()
    if (!value || loading) return
    const ok = await onSubmit(value)
    if (ok) setText("")
  }

  return (
    <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <Sparkles className="h-4 w-4" />
        </span>
        <p className="text-sm">
          <span className="font-semibold text-indigo-700">AI assistant</span>
          <span className="text-muted-foreground"> — describe a change and it updates above</span>
        </p>
      </div>

      {/* Quick-instruction chips */}
      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={loading}
            onClick={() => submit(chip)}
            className="rounded-full border border-indigo-200 bg-white px-3.5 py-2 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-50 disabled:opacity-50"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Free-text instruction + circular send */}
      <div className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              submit(text)
            }
          }}
          disabled={loading}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-full border border-indigo-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-indigo-400 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => submit(text)}
          disabled={loading || !text.trim()}
          aria-label="Send instruction"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:bg-indigo-300"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
