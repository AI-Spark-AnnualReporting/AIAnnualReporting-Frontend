"use client"

import { use, useEffect, useRef, useState } from "react"
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
import { roleSelectionComplete, MAX_AREAS_ON_PAGE } from "@/lib/areasOfFocus"
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
import { useApproveShare, useCycleShares, useSendBackShare } from "@/hooks/useShare"
import {
  KickoffBuildLoader, AREAS_REFRESH_LOADER, BRIEF_LOADER,
} from "@/components/pm/kickoff-build-loader"
import { AreaConceptCard } from "@/components/report/AreaConceptCard"
import { ShareWithClientButton } from "@/components/pm/ShareWithClientButton"
import { ClientDriftNotice } from "@/components/pm/ClientDriftNotice"
import { driftSinceResponse } from "@/lib/shareDrift"
import { ApproveDeadlineDialog } from "@/components/pm/approve-deadline-dialog"
import { cn, formatDate } from "@/lib/utils"
import { toast } from "sonner"
import {
  ArrowLeft, Check, CheckCircle2, Clock, Eye, Loader2, Megaphone,
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

export default function ReviewBriefPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const qc = useQueryClient()
  const { data: pmData, isLoading: cycleLoading } = usePMCycleDashboard(id)
  // No share button here — the brief and areas go out as part of the step-3
  // bundle. But every save on this screen 409s while that bundle is with the
  // client, so the screen has to say so rather than fail on click.
  const { data: shares } = useCycleShares(id)
  const approveShare = useApproveShare(id)
  const sendBackShare = useSendBackShare(id)
  const [sendBackOpen, setSendBackOpen] = useState(false)
  const [sendBackNote, setSendBackNote] = useState("")
  const awaitingClient = shares?.brief?.status === "pending"
  // A bundle can't be shared without concept messages — the server refuses it.
  // So once a share exists they exist, and going forward is "continue", not
  // "write them".
  const bundleShared = !!shares?.brief

  const briefShare = shares?.brief
  // They've replied and nobody has signed it off yet.
  const needsApproval = briefShare?.status === "responded"
  const clientApproved = briefShare?.status === "approved"

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
      setResult({ brief: data.strategic_brief, areas: data.areas_of_focus ?? [] })
      setBriefDirty(false) // whatever was typed is gone with the old brief

      // The concept messages are written from the areas that just came back,
      // in the same run. The client is shown all three at once, so producing
      // them on a later screen only meant a second wait and a partial share.
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
    if (bundleShared) return
    if (phase === "result" && !(await askConsent(REGENERATE_ALL_CONSENT))) return
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
  }, [cycle, phase, briefDirty])

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
  const refineAreasWith = async (
    instruction: string,
    areaIndex?: number,
  ): Promise<boolean> => {
    if (!result || themesRefining) return false
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
        return false
      }
      setResult((prev) => (prev ? { ...prev, areas: refined } : prev))
      qc.invalidateQueries({ queryKey: ["pm", "cycle", id] }) // already saved
      return true
    } catch (err) {
      toast.error((err as { message?: string })?.message || "Couldn't refine the areas of focus.")
      return false
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
    // Cancel backs out of the whole thing — the edit stays in the box, unsaved.
    if (!(await askConsent(bundleShared ? SAVE_BRIEF_ONLY_CONSENT : SAVE_BRIEF_CONSENT)))
      return
    setRewritingAreas(true)
    try {
      await runSave({ strategic_brief: brief })
      setBriefDirty(false)
      setBriefEditing(false)
      // Realigning the areas is an AI rewrite, and those are gone once the
      // client has seen this — the server refuses it. Without this check the
      // save succeeds and then throws a red toast on top of it.
      if (!bundleShared) {
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
    if (!result || bundleShared || areas.length >= MAX_AREAS_ON_PAGE) return
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

  const deleteArea = (idx: number) => {
    if (!result || bundleShared) return
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
      // doing it here keeps it to one button.
      if (needsApproval) await approveShare.mutateAsync("brief")

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

  const editMessages = (next: ConceptMessage[]) => {
    setMessages(next)
    saveDebounced({ concept_messages: next })
  }

  const refineMessage = async (instruction: string, index: number) => {
    if (bundleShared) return false
    try {
      // The endpoint rewrites the WHOLE set, so the instruction has to say
      // which one to touch — same scoping the concept screen used.
      const scoped =
        `Only modify concept message ${index + 1}` +
        (list[index]?.title ? ` ("${list[index].title}")` : "") +
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
    if (bundleShared) return false
    const areaRefined = await refineAreasWith(instruction, index)
    // A freshly added area has no message yet — asking the refiner to rewrite
    // message N when there are N-1 of them invites it to invent one.
    const messageRefined = list[index]
      ? await refineMessage(instruction, index)
      : false
    // Either half landing is a result worth keeping on screen. Both failing
    // has already raised its own toast.
    return areaRefined || messageRefined
  }

  // What Spark has changed since the client sent this back. Empty until they
  // respond, and empty again once it is signed off — after that the cycle IS
  // the approved version.
  const changedSinceResponse =
    briefShare?.status === "responded" || briefShare?.status === "approved"
      ? driftSinceResponse(briefShare.response, {
          strategic_brief: result?.brief,
          areas_of_focus: areas,
          concept_messages: list,
        }).length > 0
      : false

  // Prefer the cycle's actual name; fall back to a fiscal-year label only if
  // the name is missing.
  const fiscalLabel =
    cycle?.cycle_name ??
    (cycle?.fiscal_year ? `FY${cycle.fiscal_year} Annual Report` : "Annual Report")

  const wordCount = result?.brief.trim() ? result.brief.trim().split(/\s+/).length : 0

  const hardError = errorStatus

  if (phase === "idle") return <PageLoader />

  return (
    <div>
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Link href={`/pm/cycles/${id}/kickoff`}>
              <Button variant="outline" size="icon" className="mt-0.5 h-9 w-9 shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
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
          </div>

          {/* All three go to the client together — this is where it's sent. */}
          {phase === "result" && (
            <ShareWithClientButton
              cycleId={id}
              stage="brief"
              share={briefShare}
              // So the dialog can warn when a refine or an edit has moved the
              // text away from the version the client actually signed.
              current={{
                strategic_brief: result?.brief,
                areas_of_focus: areas,
                concept_messages: list,
              }}
            />
          )}
        </div>

        {/* On the page as well as in the approve dialog: this is where the
            editing happens, so this is where it should first be said. */}
        <ClientDriftNotice
          changed={changedSinceResponse}
          canSendBack={briefShare?.status !== "approved"}
        />

        {briefShare?.client_note && (
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4">
            <MessageSquareQuote className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">A note from the client</p>
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                {briefShare.client_note}
              </p>
            </div>
          </div>
        )}

        {/* ── Stepper ── */}
        <KickoffStepper current={2} />

        {awaitingClient && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                This is with the client right now
              </p>
              <p className="mt-0.5 text-sm text-amber-800">
                The brief and areas of focus are locked until their response is
                approved — otherwise your edits and theirs would overwrite each
                other. Approve it on the concept messages step.
              </p>
            </div>
          </div>
        )}

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
              {answersRef.current && !bundleShared && hardError !== 403 && hardError !== 404 && (
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
              {answersRef.current && !bundleShared && (
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
        {phase === "result" && result && (
          <div className="space-y-4">
            {/* AI-generated notice + save status */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700">
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0" />
                AI-generated based on your answers — review and edit, then approve.
              </span>
              <SaveIndicator state={saveState} />
            </div>

            {/* Strategic Brief */}
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
                      disabled={saveState === "saving" || awaitingClient}
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
                    disabled={awaitingClient}
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
                  {!bundleShared && (
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
                  readOnly={awaitingClient}
                  onChange={(e) => updateBrief(e.target.value)}
                  rows={10}
                  className="mt-4 text-sm leading-relaxed"
                />
              ) : (
                <div className="mt-4 rounded-lg border bg-muted/20 p-4">
                  <ProsePreview content={result.brief} className="prose-indigo" />
                </div>
              )}
              {briefRefineOpen && (
                <RefinePanel
                  chips={BRIEF_CHIPS}
                  loading={briefRefining}
                  onSubmit={submitBriefRefine}
                  placeholder="e.g. make it more concise, strengthen ESG, add a growth angle…"
                />
              )}
            </div>

            {/* Areas of Focus */}
            <div className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                    <Megaphone className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-foreground">Areas of Focus</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Add, edit or remove areas. The client marks which ones are used
                      and which one leads when you share this with them.
                    </p>
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
                    disabled={bundleShared || areas.length >= MAX_AREAS_ON_PAGE}
                    title={
                      bundleShared
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

              {!areaSelectionValid && areas.length > 0 && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  Keep at least {MIN_SELECTED_AREAS} areas of focus — the client has to be
                  able to mark that many.
                </p>
              )}

              <div className="mt-4 space-y-3">
                {areas.length === 0 && (
                  <p className="text-sm text-muted-foreground">No areas of focus were proposed.</p>
                )}
                {areas.map((area, i) => (
                  <AreaConceptCard
                    key={i}
                    index={i}
                    area={area}
                    // Position is the link: message i belongs to area i.
                    message={list[i]}
                    roleGroup="area-of-focus-primary"
                    readOnly={awaitingClient}
                    // Primary/secondary is the client's call, made on their own
                    // link. Shown here, never set here.
                    lockRole
                    onAreaChange={(next) =>
                      commitAreas(
                        areas.map((a, k) => (k === i ? { ...a, ...next } : a)),
                        false,
                      )
                    }
                    onMessageChange={(next) =>
                      editMessages(list.map((m, k) => (k === i ? { ...m, ...next } : m)))
                    }
                    onRoleChange={() => {}}
                    // Same line as Add: the set is fixed from the first
                    // share, and a delete would clear every concept message
                    // with no regenerate left to rebuild them.
                    onRemove={bundleShared ? undefined : () => deleteArea(i)}
                    // Gone for good once the client has seen this.
                    onRefine={bundleShared ? undefined : (ins) => refineCard(ins, i)}
                  />
                ))}
              </div>

            </div>
          </div>
        )}
      </div>

      {/* ── Sticky footer bar ── */}
      <div className="sticky bottom-0 z-10 -mx-8 -mb-8 mt-8 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center justify-between gap-4 px-8 py-3">
          <Link href={`/pm/cycles/${id}/kickoff`}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            {/* Gone once it has been shared, rather than greyed out: from the
                first share it never comes back, so leaving a dead button in the
                bar is furniture that reads as "broken" every visit. */}
            {(phase === "result" || phase === "soft" || phase === "error") &&
              !bundleShared && (
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
            {needsApproval && (
              <Button
                variant="outline"
                onClick={() => setSendBackOpen(true)}
                className="border-amber-300 text-amber-800 hover:bg-amber-50"
              >
                <Undo2 className="h-4 w-4" /> Send back
              </Button>
            )}
            <Button
              disabled={
                phase !== "result" ||
                list.length === 0 ||
                !areaChoiceValid ||
                !(clientApproved || needsApproval)
              }
              onClick={openApprove}
              title={
                !briefShare
                  ? "Share this with the client first"
                  : briefShare.status === "pending"
                    ? "Waiting on the client's response"
                    : list.length === 0
                      ? "Generate the concept messages first"
                      : !areaChoiceValid
                        ? `The client needs to mark ${MIN_SELECTED_AREAS}-${MAX_SELECTED_AREAS} areas, one leading`
                        : undefined
              }
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <CheckCircle2 className="h-4 w-4" />
              {needsApproval ? "Approve & kickoff" : "Approve & use"}
            </Button>
          </div>
        </div>
      </div>

      {/* Send back — the note that goes with it. Same shape as step 1's, so a
          response is handled the same way wherever you are looking at it. */}
      <Dialog open={sendBackOpen} onOpenChange={setSendBackOpen}>
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
                setSendBackOpen(false)
                setSendBackNote("")
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={sendBackShare.isPending || !sendBackNote.trim()}
              onClick={() =>
                sendBackShare.mutate(
                  { stage: "brief", comment: sendBackNote.trim() },
                  {
                    onSuccess: () => {
                      setSendBackOpen(false)
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
      {phase === "loading" && <KickoffBuildLoader {...BRIEF_LOADER} />}

      {/* Full-screen loader while the areas are rewritten against a changed
          brief — same treatment as the other multi-call AI passes. */}
      {rewritingAreas && <KickoffBuildLoader {...AREAS_REFRESH_LOADER} />}

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
