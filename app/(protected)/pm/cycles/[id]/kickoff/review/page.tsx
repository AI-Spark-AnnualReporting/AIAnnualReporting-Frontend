"use client"

import { use, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { pmApi, BriefTheme, CycleBriefFields, GenerateBriefAnswer } from "@/lib/api/pm"
import { readKickoffAnswers, consumeKickoffTrigger } from "@/lib/kickoffBriefStorage"
import { PageLoader } from "@/components/ui/spinner"
import { IntelligenceLoader } from "@/components/pm/intelligence-loader"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ProsePreview } from "@/components/ui/prose-preview"
import { KickoffBuildLoader } from "@/components/pm/kickoff-build-loader"
import { ThemeChipCard } from "@/components/report/ThemeChipCard"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { cn, formatDate } from "@/lib/utils"
import { toast } from "sonner"
import {
  ArrowLeft, CalendarClock, Check, CheckCircle2, Eye, Layers, Loader2, Pencil, Plus, RefreshCw,
  Send, ShieldAlert, Sparkles, Target,
} from "lucide-react"

// Quick-instruction chips — identical to typing the same text into the box.
const BRIEF_CHIPS = ["Make it more concise", "Strengthen ESG focus", "More formal tone", "Add a growth angle"]
const THEME_CHIPS = ["Add a sustainability theme", "Add a digital theme", "Use fewer themes", "Refine the lead theme"]

/* ────────────────────────────────────────────────────────────────────────────
   STRATEGIC BRIEF & THEMES — Step 2: Review brief

   POST /pm/cycles/{id}/generate-brief is a single synchronous call (no job
   id/polling, ~5-15s — 2-3 sequential LLM calls). The loading screen's step
   list is purely decorative (cycled on a timer), not real progress.

   On mount:
     - A fresh "Generate brief" click from Step 1 leaves a one-shot trigger in
       sessionStorage → auto-fire generation and show the loading screen.
     - Otherwise, fall back to whatever the cycle already has persisted
       (cycle.kickoff_brief / initial_themes_and_keywords) so a reload doesn't
       re-run the AI.
     - Neither present → nothing to review; bounce back to Step 1.

   Editing the brief/theme text below is LOCAL ONLY — there is no save
   endpoint yet, so nothing here persists on reload. Refine/Add-theme/Approve
   have no backend yet either and stay disabled.
──────────────────────────────────────────────────────────────────────────── */

interface ReviewResult {
  brief: string
  themes: BriefTheme[]
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

const LOADING_STEPS = [
  "Reading inputs",
  "Shaping objective & narrative",
  "Proposing themes",
] as const

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
      setResult({ brief: data.strategic_brief, themes: data.themes ?? [] })
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
        themes: cycle.initial_themes_and_keywords?.themes ?? [],
      })
      setPhase("result")
      return
    }
    // Nothing pending and nothing persisted — there's nothing to review.
    router.replace(`/pm/cycles/${id}/kickoff`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleLoading])

  const handleRegenerate = () => {
    if (!answersRef.current) return
    runGenerate(answersRef.current)
  }

  // ── Refine with AI (brief + themes) ──────────────────────────────────────
  // Each call sends the CURRENT on-screen content (with any unsaved edits) + a
  // free-text instruction; the response is the complete revised version, already
  // saved server-side. Returns true so the assistant clears its input on success.
  // Brief view mode: rendered markdown by default (bullets/formatting show
  // styled), or a raw textarea for editing. The stored value stays plain text.
  const [briefEditing, setBriefEditing] = useState(false)
  const [briefRefineOpen, setBriefRefineOpen] = useState(false)
  const [themesRefineOpen, setThemesRefineOpen] = useState(false)
  const [briefRefining, setBriefRefining] = useState(false)
  const [themesRefining, setThemesRefining] = useState(false)

  // Manual-edit persistence state (used by the edit handlers + refine cancel).
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelPendingSave = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
  }

  const refineBriefWith = async (instruction: string): Promise<boolean> => {
    if (!result || briefRefining) return false
    cancelPendingSave() // refine persists authoritatively — drop any stale save
    setBriefRefining(true)
    try {
      const data = await pmApi.refineBrief(id, { strategic_brief: result.brief, instruction })
      const refined = data.strategic_brief ?? ""
      if (refined.trim() === result.brief.trim()) {
        toast.info("No changes were applied.")
      }
      setResult((prev) => (prev ? { ...prev, brief: refined } : prev))
      qc.invalidateQueries({ queryKey: ["pm", "cycle", id] }) // already saved
      return true
    } catch (err) {
      toast.error((err as { message?: string })?.message || "Couldn't refine the brief.")
      return false
    } finally {
      setBriefRefining(false)
    }
  }

  const refineThemesWith = async (instruction: string): Promise<boolean> => {
    if (!result || themesRefining) return false
    cancelPendingSave()
    setThemesRefining(true)
    try {
      const data = await pmApi.refineThemes(id, { themes: result.themes, instruction })
      setResult((prev) => (prev ? { ...prev, themes: data.themes ?? [] } : prev))
      qc.invalidateQueries({ queryKey: ["pm", "cycle", id] }) // already saved
      return true
    } catch (err) {
      toast.error((err as { message?: string })?.message || "Couldn't refine the themes.")
      return false
    } finally {
      setThemesRefining(false)
    }
  }

  // Decorative-only step cycling while the request is in flight.
  const [loadingStep, setLoadingStep] = useState(0)
  // The backend recently dropped its output-length cap, so generation can now
  // legitimately run well past "typical" — surface a reassurance message
  // instead of letting a slow-but-healthy request look frozen.
  const [takingLong, setTakingLong] = useState(false)
  useEffect(() => {
    if (phase !== "loading") {
      setLoadingStep(0)
      setTakingLong(false)
      return
    }
    const stepTimer = setInterval(() => {
      setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1))
    }, 2200)
    const longTimer = setTimeout(() => setTakingLong(true), 20_000)
    return () => {
      clearInterval(stepTimer)
      clearTimeout(longTimer)
    }
  }, [phase])

  // ── Persisting manual edits (PUT save-brief-and-themes) ──────────────────
  // Debounce continuous typing (brief text, theme titles); save discrete
  // actions (add/delete theme, keyword chip) immediately. We keep local state
  // as the source of truth and don't overwrite it from the response (which
  // just echoes what we sent) to avoid clobbering an in-progress edit.
  useEffect(() => () => cancelPendingSave(), [])

  const runSave = async (payload: { strategic_brief?: string; themes?: BriefTheme[] }) => {
    setSaveState("saving")
    try {
      await pmApi.saveBriefAndThemes(id, payload)
      setSaveState("saved")
      qc.invalidateQueries({ queryKey: ["pm", "cycle", id] })
    } catch (err) {
      setSaveState("error")
      toast.error((err as { message?: string })?.message || "Couldn't save your changes.")
    }
  }

  const saveNow = (payload: { strategic_brief?: string; themes?: BriefTheme[] }) => {
    cancelPendingSave()
    runSave(payload)
  }

  const saveDebounced = (payload: { strategic_brief?: string; themes?: BriefTheme[] }) => {
    setSaveState("saving")
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      runSave(payload)
    }, 800)
  }

  const updateBrief = (value: string) => {
    setResult((prev) => (prev ? { ...prev, brief: value } : prev))
    saveDebounced({ strategic_brief: value })
  }

  const commitThemes = (nextThemes: BriefTheme[], immediate: boolean) => {
    setResult((prev) => (prev ? { ...prev, themes: nextThemes } : prev))
    if (immediate) saveNow({ themes: nextThemes })
    else saveDebounced({ themes: nextThemes })
  }

  const updateThemeTitle = (idx: number, value: string) => {
    if (!result) return
    commitThemes(result.themes.map((t, i) => (i === idx ? { ...t, title: value } : t)), false)
  }
  const removeThemeKeyword = (idx: number, kwIdx: number) => {
    if (!result) return
    commitThemes(
      result.themes.map((t, i) =>
        i === idx ? { ...t, keywords: t.keywords.filter((_, k) => k !== kwIdx) } : t,
      ),
      true,
    )
  }
  const addThemeKeyword = (idx: number, raw: string) => {
    if (!result) return
    const kw = raw.trim()
    if (!kw) return
    const existing = result.themes[idx].keywords
    if (existing.some((k) => k.toLowerCase() === kw.toLowerCase())) return
    commitThemes(
      result.themes.map((t, i) => (i === idx ? { ...t, keywords: [...t.keywords, kw] } : t)),
      true,
    )
  }
  const addTheme = () => {
    if (!result) return
    commitThemes([...result.themes, { title: "", keywords: [] }], true)
  }
  const deleteTheme = (idx: number) => {
    if (!result) return
    commitThemes(result.themes.filter((_, i) => i !== idx), true)
  }

  // ── Approve & use → set the questions deadline ────────────────────────────
  // Approving the brief opens a modal that requires a questions deadline (the
  // date departments must answer their assigned questions by) before the cycle
  // moves forward. The date is persisted via PUT questions-deadline; only then
  // does the flow continue to the cycle dashboard.
  const todayIso = new Date().toISOString().slice(0, 10)
  const [approveOpen, setApproveOpen] = useState(false)
  const [deadlineInput, setDeadlineInput] = useState("")
  // How many questions to generate per department (5-20, backend default 12).
  const [numQuestions, setNumQuestions] = useState(12)
  const [approving, setApproving] = useState(false)
  // After the deadline is saved, we generate questions (POST /pm/kickoff) behind
  // a full-screen loader, then land on /pm.
  const [generating, setGenerating] = useState(false)

  const openApprove = () => {
    // Pre-fill with an already-saved deadline if the cycle has one.
    setDeadlineInput(cycle?.questions_deadline?.slice(0, 10) ?? "")
    setApproveOpen(true)
  }

  // Both fields are mandatory before approve: a valid future/today deadline AND
  // a question count within the backend's accepted 5–20 range.
  const deadlineValid = !!deadlineInput && deadlineInput >= todayIso
  const numQuestionsValid = numQuestions >= 5 && numQuestions <= 20
  const approveValid = deadlineValid && numQuestionsValid

  // Approve kicks off the cycle for real: it fires the AI question-generation
  // pipeline for every department (POST /pm/kickoff) using the approved brief and
  // the chosen question count, then persists the deadline. The full-screen
  // KickoffLoader covers the wait, and on success the PM lands on the cycle
  // dashboard where the freshly generated department sessions appear.
  const confirmApprove = async () => {
    if (!approveValid || !result?.brief || approving) return
    setApproving(true)
    try {
      // 1) Generate the questions. This is the long call (~up to 3 min).
      await pmApi.submitKickoff({
        cycle_id: id,
        strategic_brief: result.brief,
        num_questions: numQuestions,
      })

      // 2) Persist the deadline — non-blocking. The kickoff already succeeded, so
      // a deadline-save failure only warns; it doesn't roll anything back.
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
      // A timeout aborts client-side while the backend is (very likely) still
      // generating. Resubmitting would fire a DUPLICATE kickoff, so don't
      // re-enable — send the PM to the dashboard to check instead.
      const msg = (err as { message?: string })?.message ?? ""
      if (/timeout|ECONNABORTED/i.test(msg)) {
        toast.message("Questions may still be generating — check the cycle dashboard in a moment.")
        setApproveOpen(false)
        router.push(`/pm/cycles/${id}`)
        return
      }
      toast.error(msg || "Couldn't kick off the cycle.")
      setApproving(false)
      return
    }

    // Deadline saved — now kick off AI question generation (POST /pm/kickoff)
    // behind the "Building your intelligence dashboard" loader. num_questions is
    // sent here, not on the deadline endpoint. On success, land on /pm.
    setGenerating(true)
    try {
      await pmApi.submitKickoff({
        cycle_id: id,
        strategic_brief: result?.brief ?? "",
        num_questions: numQuestions,
      })
      qc.invalidateQueries({ queryKey: ["pm", "cycle", id] })
      router.push("/pm")
    } catch (err) {
      toast.error((err as { message?: string })?.message || "Couldn't generate questions.")
      setGenerating(false)
      setApproving(false)
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
  if (generating) return <IntelligenceLoader />

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
              Strategic Brief &amp; Themes
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {fiscalLabel} · Set the strategic direction before departments begin.
            </p>
          </div>
        </div>

        {/* ── Stepper ── */}
        <Stepper current={2} />

        {/* ── Loading ── */}
        {phase === "loading" && (
          <div className="flex flex-col items-center gap-6 rounded-2xl border bg-card px-8 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground">Generating your strategic brief…</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {takingLong
                  ? "Still working — longer briefs can take a little while."
                  : "This usually takes under a minute."}
              </p>
            </div>
            <div className="w-full max-w-xs space-y-3 text-left">
              {LOADING_STEPS.map((step, i) => {
                const done = i < loadingStep
                const active = i === loadingStep
                return (
                  <div key={step} className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                        done
                          ? "bg-green-100 text-green-700"
                          : active
                            ? "bg-indigo-100 text-indigo-600"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {done ? (
                        <Check className="h-3 w-3" />
                      ) : active ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      )}
                    </span>
                    <span className={cn("text-sm", done || active ? "text-foreground" : "text-muted-foreground")}>
                      {step}
                    </span>
                  </div>
                )
              })}
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
                  onSubmit={refineBriefWith}
                  placeholder="e.g. make it more concise, strengthen ESG, add a growth angle…"
                />
              )}
            </div>

            {/* Themes */}
            <div className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                    <Layers className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-foreground">Themes</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Recurring threads the narrative will weave throughout.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => setThemesRefineOpen((o) => !o)}
                    className={cn(
                      "bg-indigo-50 text-indigo-600 hover:bg-indigo-100",
                      themesRefineOpen && "bg-indigo-100 ring-1 ring-indigo-300",
                    )}
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Refine with AI
                  </Button>
                  <Button size="sm" variant="outline" onClick={addTheme}>
                    <Plus className="h-3.5 w-3.5" /> Add theme
                  </Button>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {result.themes.length === 0 && (
                  <p className="text-sm text-muted-foreground">No themes were proposed.</p>
                )}
                {result.themes.map((theme, i) => (
                  <ThemeChipCard
                    key={i}
                    index={i}
                    theme={theme}
                    onTitleChange={(v) => updateThemeTitle(i, v)}
                    onAddKeyword={(kw) => addThemeKeyword(i, kw)}
                    onRemoveKeyword={(kwIdx) => removeThemeKeyword(i, kwIdx)}
                    onRemove={() => deleteTheme(i)}
                  />
                ))}
              </div>

              {themesRefineOpen && (
                <RefinePanel
                  chips={THEME_CHIPS}
                  loading={themesRefining}
                  onSubmit={refineThemesWith}
                  placeholder="e.g. add a digital theme, use fewer themes, refine the lead…"
                />
              )}
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
              disabled={phase !== "result"}
              onClick={openApprove}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <CheckCircle2 className="h-4 w-4" /> Approve &amp; use
            </Button>
          </div>
        </div>
      </div>

      {/* ── Approve & use → questions-deadline modal ── */}
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
        numQuestions={numQuestions}
        onNumQuestionsChange={setNumQuestions}
      />

      {/* Full-screen loader while the kickoff pipeline generates questions.
          Sits above the (still-open) dialog via its own fixed inset-0 z-[100]. */}
      {approving && <KickoffBuildLoader />}
    </div>
  )
}

/* ── Approve & use — questions-deadline modal ────────────────────────────────
   Blocks the cycle from moving forward until the PM commits a date by which
   departments must answer their assigned questions. Past dates are rejected
   (the input's min + a guarded confirm button), so there is no way to advance
   without a valid future-or-today deadline. */
function ApproveDeadlineDialog({
  open,
  onOpenChange,
  value,
  onChange,
  min,
  valid,
  canApprove,
  numQuestions,
  onNumQuestionsChange,
  submitting,
  onConfirm,
  cycleLabel,
  numQuestions,
  onNumQuestionsChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string
  onChange: (value: string) => void
  min: string
  valid: boolean
  canApprove: boolean
  numQuestions: number
  onNumQuestionsChange: (value: number) => void
  submitting: boolean
  onConfirm: () => void
  cycleLabel: string
  numQuestions: number
  onNumQuestionsChange: (n: number) => void
}) {
  // Distinguish "nothing chosen yet" from "chose a past date" for the helper text.
  const isPast = !!value && value < min

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 overflow-hidden p-0" hideClose={submitting}>
        {/* Themed header band */}
        <DialogHeader className="space-y-3 border-b bg-indigo-50 px-6 py-5 text-left">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <DialogTitle className="text-indigo-900">Set the questions deadline</DialogTitle>
            <p className="text-sm text-indigo-700/80">
              Approving locks in the brief for <span className="font-medium">{cycleLabel}</span>.
              Choose the date every department must answer its assigned questions by — they&apos;ll
              be notified straight away.
            </p>
          </div>
        </DialogHeader>

        <div className="space-y-2 px-6 py-5">
          <label htmlFor="questions-deadline" className="text-sm font-medium text-foreground">
            Questions deadline
          </label>
          <Input
            id="questions-deadline"
            type="date"
            value={value}
            min={min}
            disabled={submitting}
            onChange={(e) => onChange(e.target.value)}
            className={cn(
              "h-11",
              isPast && "border-destructive focus-visible:ring-destructive",
            )}
          />
          {isPast ? (
            <p className="text-xs font-medium text-destructive">
              The deadline can&apos;t be in the past. Pick today or a later date.
            </p>
          ) : valid ? (
            <p className="text-xs text-muted-foreground">
              Departments must answer by{" "}
              <span className="font-medium text-foreground">{formatDate(value)}</span>.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              A deadline is required before the cycle can move forward.
            </p>
          )}
        </div>

        {/* Questions-per-department slider (5-20, backend default 12) */}
        <div className="space-y-2 border-t px-6 py-5">
          <div className="flex items-center justify-between">
            <label htmlFor="num-questions" className="text-sm font-medium text-foreground">
              Questions per department:{" "}
              <span className="tabular-nums text-foreground">{numQuestions}</span>
            </label>
            {numQuestions === 12 && (
              <span className="text-xs text-muted-foreground">(default)</span>
            )}
          </div>
          <input
            id="num-questions"
            type="range"
            min={5}
            max={20}
            step={1}
            value={numQuestions}
            disabled={submitting}
            onChange={(e) => onNumQuestionsChange(parseInt(e.target.value, 10))}
            className="h-1.5 w-full cursor-pointer accent-indigo-600"
          />
          <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
            <span>5</span>
            <span>12</span>
            <span>20</span>
          </div>
          <p className="text-xs text-muted-foreground">
            How many questions the AI generates for each department.
          </p>
        </div>

        <DialogFooter className="gap-2 border-t bg-muted/30 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!canApprove || submitting}
            className="bg-indigo-600 text-white hover:bg-indigo-700"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Setting deadline…</>
            ) : (
              <><CheckCircle2 className="h-4 w-4" /> Approve &amp; continue</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Save status indicator ───────────────────────────────────────────────── */
function SaveIndicator({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "idle") return null
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


/* ── Two-step progress indicator (mirrors Step 1's) ──────────────────────── */
function Stepper({ current }: { current: 1 | 2 }) {
  const steps = [
    { n: 1, label: "Questionnaire" },
    { n: 2, label: "Review brief" },
  ] as const
  return (
    <div className="flex items-center rounded-2xl border bg-card px-5 py-3.5">
      {steps.map((s, i) => {
        const active = s.n === current
        const done = s.n < current
        return (
          <div key={s.n} className={cn("flex items-center", i === 0 && "flex-1")}>
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                active
                  ? "bg-indigo-600 text-white"
                  : done
                    ? "bg-green-500 text-white"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : s.n}
            </span>
            <span
              className={cn(
                "ml-2 text-sm font-medium",
                active || done ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
            {i === 0 && (
              <div className={cn("mx-4 h-px flex-1", current > 1 ? "bg-green-400" : "bg-border")} />
            )}
          </div>
        )
      })}
    </div>
  )
}
