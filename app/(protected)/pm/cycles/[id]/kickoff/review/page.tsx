"use client"

import { use, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { pmApi, BriefTheme, CycleBriefFields, GenerateBriefAnswer } from "@/lib/api/pm"
import { readKickoffAnswers, consumeKickoffTrigger } from "@/lib/kickoffBriefStorage"
import { PageLoader } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ProsePreview } from "@/components/ui/prose-preview"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  ArrowLeft, Check, CheckCircle2, Eye, Layers, Loader2, Pencil, Plus, RefreshCw,
  Send, ShieldAlert, Sparkles, Target, X,
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
                  <ThemeCard
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
              disabled
              title="Coming soon"
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <CheckCircle2 className="h-4 w-4" /> Approve &amp; use
            </Button>
          </div>
        </div>
      </div>
    </div>
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

/* ── Theme card — title + editable keyword chips ─────────────────────────── */
function ThemeCard({
  index,
  theme,
  onTitleChange,
  onAddKeyword,
  onRemoveKeyword,
  onRemove,
}: {
  index: number
  theme: BriefTheme
  onTitleChange: (value: string) => void
  onAddKeyword: (keyword: string) => void
  onRemoveKeyword: (keywordIndex: number) => void
  onRemove: () => void
}) {
  const [draft, setDraft] = useState("")

  const commitDraft = () => {
    if (draft.trim()) onAddKeyword(draft)
    setDraft("")
  }

  return (
    <div className="relative rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 pr-9">
      {/* Remove theme */}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove theme"
        className="absolute right-3 top-3 text-muted-foreground/40 transition-colors hover:text-destructive"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-xs font-semibold text-indigo-600">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          {/* Seamless inline-editable title */}
          <input
            type="text"
            value={theme.title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="w-full border-0 bg-transparent p-0 text-sm font-semibold text-foreground outline-none"
          />
          {/* Editable keyword chips */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {theme.keywords.map((kw, k) => (
              <span
                key={k}
                className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700"
              >
                {kw}
                <button
                  type="button"
                  onClick={() => onRemoveKeyword(k)}
                  className="text-indigo-400 transition-colors hover:text-indigo-700"
                  aria-label={`Remove ${kw}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {/* Add-keyword input — commits on Enter, comma, or blur */}
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault()
                  commitDraft()
                } else if (e.key === "Backspace" && draft === "" && theme.keywords.length > 0) {
                  onRemoveKeyword(theme.keywords.length - 1)
                }
              }}
              onBlur={commitDraft}
              placeholder="Add keyword…"
              className="min-w-[8rem] flex-1 border-0 bg-transparent px-1 py-1 text-xs outline-none placeholder:text-muted-foreground/60"
            />
          </div>
        </div>
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
