"use client"

import { use, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import {
  pmApi, AreaOfFocus, AreaRole, CycleBriefFields, GenerateBriefAnswer,
  roleSelectionSaveable, MIN_SELECTED_AREAS, MAX_SELECTED_AREAS,
} from "@/lib/api/pm"
import { readKickoffAnswers, consumeKickoffTrigger } from "@/lib/kickoffBriefStorage"
import { PageLoader } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Textarea } from "@/components/ui/textarea"
import { ProsePreview } from "@/components/ui/prose-preview"
import { KickoffStepper } from "@/components/pm/kickoff-stepper"
import {
  KickoffBuildLoader, CONCEPT_MESSAGE_LOADER, AREAS_REFRESH_LOADER, BRIEF_LOADER,
} from "@/components/pm/kickoff-build-loader"
import { ThemeChipCard } from "@/components/report/ThemeChipCard"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  ArrowLeft, Check, CheckCircle2, Eye, Loader2, Megaphone, Pencil, Plus, RefreshCw,
  Send, ShieldAlert, Sparkles, Target,
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
    "them to match — that replaces their slogans and sub-slogans, including any you've written " +
    "by hand. Your Primary and Secondary picks are kept.",
  confirmLabel: "Save & regenerate areas",
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

  const [phase, setPhase] = useState<Phase>("idle")
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
  }

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

  // ── Persisting manual edits (PUT save-brief-and-areas-of-focus) ──────────
  // Areas of focus autosave: debounced for continuous typing (slogans),
  // immediate for discrete actions (add/delete area, sub-slogan chip, role).
  // The BRIEF deliberately does not — it saves on an explicit button, because
  // saving it also offers to rewrite the areas, and that question can't be
  // asked mid-keystroke. We keep local state as the source of truth and don't
  // overwrite it from the response (which just echoes what we sent) to avoid
  // clobbering an in-progress edit.
  useEffect(() => () => cancelPendingSave(), [])

  const runSave = async (payload: { strategic_brief?: string; areas_of_focus?: AreaOfFocus[] }) => {
    setSaveState("saving")
    try {
      await pmApi.saveBriefAndAreas(id, payload)
      setSaveState("saved")
      qc.invalidateQueries({ queryKey: ["pm", "cycle", id] })
    } catch (err) {
      setSaveState("error")
      toast.error((err as { message?: string })?.message || "Couldn't save your changes.")
    }
  }

  const saveNow = (payload: { strategic_brief?: string; areas_of_focus?: AreaOfFocus[] }) => {
    cancelPendingSave()
    runSave(payload)
  }

  const saveDebounced = (payload: { strategic_brief?: string; areas_of_focus?: AreaOfFocus[] }) => {
    setSaveState("saving")
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      runSave(payload)
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
    if (!(await askConsent(SAVE_BRIEF_CONSENT))) return
    setRewritingAreas(true)
    try {
      await runSave({ strategic_brief: brief })
      setBriefDirty(false)
      setBriefEditing(false)
      await refineAreasWith(realignAreasInstruction(brief))
    } finally {
      setRewritingAreas(false)
    }
  }

  // The server rejects a half-made choice with a 422, so a save is only fired
  // once the list is persistable. While it isn't, edits stay local and the
  // indicator says so — the next valid change sends the WHOLE list, which
  // carries those earlier edits with it.
  const commitAreas = (next: AreaOfFocus[], immediate: boolean) => {
    setResult((prev) => (prev ? { ...prev, areas: next } : prev))
    if (!roleSelectionSaveable(next)) {
      cancelPendingSave()
      setSaveState("blocked")
      return
    }
    if (immediate) saveNow({ areas_of_focus: next })
    else saveDebounced({ areas_of_focus: next })
  }

  const areas = result?.areas ?? []
  const selectedAreaCount = areas.filter((a) => a.role !== "none").length
  // Approve needs a COMPLETE choice — "everything untouched" is persistable but
  // is not a decision, so it can't move the cycle forward.
  const areaSelectionValid = selectedAreaCount > 0 && roleSelectionSaveable(areas)

  const setAreaRole = (idx: number, role: AreaRole) => {
    if (!result) return
    if (
      role !== "none" &&
      areas[idx]?.role === "none" &&
      selectedAreaCount >= MAX_SELECTED_AREAS
    ) {
      toast.error(`Only ${MAX_SELECTED_AREAS} areas of focus can be carried forward — drop one first.`)
      return
    }
    commitAreas(
      areas.map((a, i) =>
        i === idx
          ? { ...a, role }
          : // Primary is exclusive: whoever held it becomes secondary.
            role === "primary" && a.role === "primary"
            ? { ...a, role: "secondary" }
            : a,
      ),
      true,
    )
  }

  const updateSlogan = (idx: number, value: string) => {
    if (!result) return
    commitAreas(areas.map((a, i) => (i === idx ? { ...a, slogan: value } : a)), false)
  }
  const editSubSlogan = (idx: number, subIdx: number, value: string) => {
    if (!result) return
    commitAreas(
      areas.map((a, i) =>
        i === idx ? { ...a, sub_slogans: a.sub_slogans.map((s, k) => (k === subIdx ? value : s)) } : a,
      ),
      false,
    )
  }
  const removeSubSlogan = (idx: number, subIdx: number) => {
    if (!result) return
    commitAreas(
      areas.map((a, i) =>
        i === idx ? { ...a, sub_slogans: a.sub_slogans.filter((_, k) => k !== subIdx) } : a,
      ),
      true,
    )
  }
  const addSubSlogan = (idx: number, raw: string) => {
    if (!result) return
    const value = raw.trim()
    if (!value) return
    const existing = areas[idx].sub_slogans
    if (existing.some((s) => s.toLowerCase() === value.toLowerCase())) return
    commitAreas(
      areas.map((a, i) => (i === idx ? { ...a, sub_slogans: [...a.sub_slogans, value] } : a)),
      true,
    )
  }
  const addArea = () => {
    if (!result || areas.length >= MAX_SELECTED_AREAS) return
    commitAreas([...areas, { slogan: "", sub_slogans: [], role: "none" }], true)
  }
  const deleteArea = (idx: number) => {
    if (!result) return
    commitAreas(areas.filter((_, i) => i !== idx), true)
  }

  // "Approve & use" no longer ends the wizard — it writes the concept messages
  // for the areas just approved, then advances to Step 3 (which owns the
  // deadline modal and the kickoff pipeline).
  //
  // Generating HERE rather than on arrival means the PM waits behind a loader
  // that explains itself instead of landing on an empty screen with a button.
  const [buildingConcepts, setBuildingConcepts] = useState(false)

  const goToConceptMessages = async () => {
    if (!areaSelectionValid || buildingConcepts) return
    // The brief no longer autosaves, so leaving with unsent text would drop it.
    if (briefDirty) {
      toast.error("Save your brief changes before continuing.")
      return
    }
    setBuildingConcepts(true)
    const next = `/pm/cycles/${id}/kickoff/concept`
    try {
      // Coming back through Step 2 must not overwrite messages the PM has
      // already edited — only generate when there's nothing stored.
      const existing = await pmApi.getConceptMessages(id)
      if (existing.concept_messages?.length) {
        router.push(next)
        return
      }
      // Soft failure is a 200 with an empty list, so check the length. Step 3
      // has its own Generate button, so it's still a fine place to land.
      const data = await pmApi.generateConceptMessages(id)
      if (!data.concept_messages?.length) {
        toast.error("Couldn't write the concept messages — you can retry on the next screen.")
      }
      qc.invalidateQueries({ queryKey: ["pm", "cycle", id] })
      router.push(next)
    } catch (err) {
      // Nothing was created, so stay put and let them press Approve again.
      toast.error((err as { message?: string })?.message || "Couldn't write the concept messages.")
      setBuildingConcepts(false)
    }
  }

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
              Strategic Brief &amp; Areas of Focus
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {fiscalLabel} · Set the strategic direction before departments begin.
            </p>
          </div>
        </div>

        {/* ── Stepper ── */}
        <KickoffStepper current={2} />

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
              {answersRef.current && hardError !== 403 && hardError !== 404 && (
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
              {answersRef.current && (
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
                      disabled={saveState === "saving"}
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
                    onClick={() => setBriefEditing((e) => !e)}
                  >
                    {briefEditing ? (
                      <><Eye className="h-3.5 w-3.5" /> Preview</>
                    ) : (
                      <><Pencil className="h-3.5 w-3.5" /> Edit</>
                    )}
                  </Button>
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
                  <span className="shrink-0 text-xs text-muted-foreground">{wordCount} words</span>
                </div>
              </div>
              {briefEditing ? (
                <Textarea
                  value={result.brief}
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
                      Mark {MIN_SELECTED_AREAS}–{MAX_SELECTED_AREAS} slogans to carry forward —
                      exactly one Primary, the rest Secondary. Anything left unmarked is dropped.
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
                    {selectedAreaCount === 0
                      ? "nothing marked yet"
                      : `${areas.filter((a) => a.role === "primary").length} primary · ${
                          areas.filter((a) => a.role === "secondary").length
                        } secondary`}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={addArea}
                    disabled={areas.length >= MAX_SELECTED_AREAS}
                    title={
                      areas.length >= MAX_SELECTED_AREAS
                        ? `At most ${MAX_SELECTED_AREAS} areas of focus`
                        : undefined
                    }
                  >
                    <Plus className="h-3.5 w-3.5" /> Add area of focus
                  </Button>
                </div>
              </div>

              {!areaSelectionValid && areas.length > 0 && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  {selectedAreaCount === 0
                    ? `Mark ${MIN_SELECTED_AREAS}–${MAX_SELECTED_AREAS} areas of focus — exactly one Primary — to continue.`
                    : areas.filter((a) => a.role === "primary").length !== 1
                      ? "Pick exactly one Primary slogan to continue."
                      : selectedAreaCount < MIN_SELECTED_AREAS
                        ? `Mark at least ${MIN_SELECTED_AREAS} areas of focus to continue.`
                        : `Mark no more than ${MAX_SELECTED_AREAS} areas of focus to continue.`}
                </p>
              )}

              <div className="mt-4 space-y-3">
                {areas.length === 0 && (
                  <p className="text-sm text-muted-foreground">No areas of focus were proposed.</p>
                )}
                {areas.map((area, i) => (
                  <ThemeChipCard
                    key={i}
                    index={i}
                    // The card speaks title/keywords for both this screen and the
                    // suggested-themes one; areas of focus map onto it here.
                    theme={{ title: area.slogan, keywords: area.sub_slogans, summary: area.summary }}
                    role={area.role}
                    onRoleChange={(r) => setAreaRole(i, r)}
                    roleGroup="area-of-focus-primary"
                    onTitleChange={(v) => updateSlogan(i, v)}
                    onAddKeyword={(s) => addSubSlogan(i, s)}
                    onRemoveKeyword={(subIdx) => removeSubSlogan(i, subIdx)}
                    onEditKeyword={(subIdx, v) => editSubSlogan(i, subIdx, v)}
                    addPlaceholder="Add sub-slogan…"
                    onRemove={() => deleteArea(i)}
                    onRefine={(ins) => refineAreasWith(ins, i)}
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
            {(phase === "result" || phase === "soft" || phase === "error") && (
              <Button
                variant="outline"
                onClick={handleRegenerate}
                disabled={!answersRef.current}
                title={!answersRef.current ? "Answer the questionnaire again to regenerate" : undefined}
              >
                <RefreshCw className="h-4 w-4" /> Regenerate
              </Button>
            )}
            <Button
              disabled={phase !== "result" || !areaSelectionValid || buildingConcepts}
              onClick={goToConceptMessages}
              title={
                phase === "result" && !areaSelectionValid
                  ? `Mark ${MIN_SELECTED_AREAS}–${MAX_SELECTED_AREAS} areas of focus, with one Primary, first`
                  : undefined
              }
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {buildingConcepts ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Approve &amp; use
            </Button>
          </div>
        </div>
      </div>

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

      {/* Full-screen loader while the concept messages are written. Stays up
          through the navigation so Step 3 doesn't flash an empty state. */}
      {buildingConcepts && <KickoffBuildLoader {...CONCEPT_MESSAGE_LOADER} />}
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
