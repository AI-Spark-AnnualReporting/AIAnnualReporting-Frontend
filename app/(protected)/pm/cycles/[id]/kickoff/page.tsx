"use client"

import { use, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { usePMCycleDashboard, useSurveyQuestions } from "@/hooks/useSessions"
import { pmApi, SurveyQuestion, CycleBriefFields, GenerateBriefAnswer } from "@/lib/api/pm"
import { documentsApi } from "@/lib/api/documents"
import { storeKickoffAnswers } from "@/lib/kickoffBriefStorage"
import { PageLoader } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, Clock, FileText, Loader2,
  ShieldAlert, Sparkles, Upload, X,
} from "lucide-react"

const ALLOWED_BRIEF_EXTS = [".pdf", ".docx", ".doc", ".txt"]
const MAX_BRIEF_BYTES = 20 * 1024 * 1024 // 20 MB

/* ────────────────────────────────────────────────────────────────────────────
   STRATEGIC BRIEF & THEMES — Step 1: Questionnaire

   Questions come live from GET /pm/cycles/{id}/survey-questions (see
   useSurveyQuestions + pmApi.getSurveyQuestions). Nothing here is hardcoded:
   - `total` drives the "X of {total} answered" counter.
   - `options: string[]` → chip-select; the LAST option is always "Other" and
     reveals a free-text box when picked.
   - `options: null` → plain free-text box, no chips.
   - Order is stable per cycle, so questions are safely indexed by position.

   Answers only live in local state (no answer-save endpoint) until "Generate
   brief" is clicked, at which point they're handed to Step 2
   (kickoff/review) via sessionStorage — see lib/kickoffBriefStorage.
──────────────────────────────────────────────────────────────────────────── */

/** Per-question answer. `selected` holds every preset chip the PM has toggled
 *  on (multi-select — any number of chips at once). `freeText` is either the
 *  plain answer (no-options mode) or the independent "Other…" detail, which
 *  can be filled in alongside any number of selected chips. */
interface Answer {
  selected: string[]
  freeText: string
}

const emptyAnswer: Answer = { selected: [], freeText: "" }

/** The trailing option in a chip-mode question is always the "Other" escape hatch. */
const otherLabelOf = (q: SurveyQuestion) =>
  q.options && q.options.length > 0 ? q.options[q.options.length - 1] : null

function isAnswered(a: Answer | undefined) {
  if (!a) return false
  return a.selected.length > 0 || a.freeText.trim().length > 0
}

export default function KickoffQuestionnairePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { data: pmData, isLoading: cycleLoading } = usePMCycleDashboard(id)
  const {
    data: surveyData,
    isLoading: questionsLoading,
    error: questionsError,
  } = useSurveyQuestions(id)

  // Keyed by array position, NOT q.id — the backend doesn't guarantee `id` is
  // unique across questions in a cycle, only that ORDER is stable. Keying by
  // id let two questions that happen to share an id share one answer slot,
  // which showed up as "picking a chip in one question also selects it in
  // another." Position is the one thing the API contract actually promises.
  const [answers, setAnswers] = useState<Record<number, Answer>>({})

  // Optional strategic-brief document. Uploaded immediately on pick to
  // POST /pm/cycles/{id}/brief-document (replaces any prior doc on the cycle).
  // generate-brief later reads whatever doc is on the cycle, so we must wait
  // for a successful upload before allowing "Generate brief".
  const [briefFile, setBriefFile] = useState<File | null>(null)
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "done" | "error">("idle")
  const [uploadError, setUploadError] = useState<string | null>(null)
  // Id of the currently-attached doc — needed to DELETE it on remove.
  const [briefDocId, setBriefDocId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Guards against a slow upload landing after the file was replaced/removed.
  const uploadSeq = useRef(0)

  const uploadBrief = async (file: File) => {
    const seq = ++uploadSeq.current
    setUploadState("uploading")
    setUploadError(null)
    try {
      const res = await pmApi.uploadBriefDocument(id, file)
      if (seq !== uploadSeq.current) return // superseded by a newer pick/remove
      setBriefDocId(res.documents?.[0]?.document_id ?? null)
      setUploadState("done")
    } catch (err) {
      if (seq !== uploadSeq.current) return
      // The apiClient interceptor surfaces the backend `detail` as `message`.
      setUploadError((err as { message?: string })?.message || "Upload failed. Please try again.")
      setUploadState("error")
    }
  }

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Clear the input so the same filename can be re-picked after a remove.
    if (fileRef.current) fileRef.current.value = ""
    if (!file) return

    const nameLower = file.name.toLowerCase()
    if (!ALLOWED_BRIEF_EXTS.some((ext) => nameLower.endsWith(ext))) {
      setBriefFile(file)
      uploadSeq.current++ // cancel any in-flight upload
      setUploadState("error")
      setUploadError("Unsupported file type — please upload a PDF, DOCX, DOC, or TXT.")
      return
    }
    if (file.size > MAX_BRIEF_BYTES) {
      setBriefFile(file)
      uploadSeq.current++
      setUploadState("error")
      setUploadError("File is too large — the maximum size is 20 MB.")
      return
    }
    setBriefFile(file)
    uploadBrief(file)
  }

  const removeBrief = () => {
    uploadSeq.current++ // ignore any in-flight upload result
    // Detach the doc from the cycle so generate-brief won't keep using it.
    // Fire-and-forget: the UI clears immediately; a failed delete is logged.
    if (briefDocId) {
      documentsApi.remove(briefDocId).catch((err) => {
        console.error("[brief-document] delete failed", err)
      })
    }
    setBriefFile(null)
    setBriefDocId(null)
    setUploadState("idle")
    setUploadError(null)
  }

  const cycle = (pmData as { cycle?: CycleBriefFields } | undefined)?.cycle
  // Prefer the cycle's actual name; fall back to a fiscal-year label only if
  // the name is missing.
  const fiscalLabel =
    cycle?.cycle_name ??
    (cycle?.fiscal_year ? `FY${cycle.fiscal_year} Annual Report` : "Annual Report")

  // Until a kickoff brief exists, the cycle dashboard immediately redirects back
  // here (it can't be managed yet) — so "Back" must exit to the cycles list
  // instead, or clicking it would look like a no-op.
  const backHref = cycle?.kickoff_brief ? `/pm/cycles/${id}` : "/pm/cycles"

  const questions = surveyData?.questions ?? []
  const total = surveyData?.total ?? 0

  const answeredCount = useMemo(
    () => questions.reduce((n, _q, i) => n + (isAnswered(answers[i]) ? 1 : 0), 0),
    [questions, answers],
  )
  const progressPct = total > 0 ? Math.round((answeredCount / total) * 100) : 0

  // Multi-select — toggles one chip on/off without touching any others or the
  // free-text field.
  const toggleChip = (index: number, value: string) =>
    setAnswers((prev) => {
      const current = prev[index] ?? emptyAnswer
      const selected = current.selected.includes(value)
        ? current.selected.filter((v) => v !== value)
        : [...current.selected, value]
      return { ...prev, [index]: { ...current, selected } }
    })

  // Free text is fully independent of chip selection — used for plain
  // free-text questions AND as the always-available "Other…" detail.
  const setFreeText = (index: number, value: string) =>
    setAnswers((prev) => ({ ...prev, [index]: { selected: prev[index]?.selected ?? [], freeText: value } }))

  const allAnswered = total > 0 && answeredCount === total
  // Block generation while an attached doc is still uploading — generate-brief
  // reads the cycle's doc, so it must land first. (An upload error doesn't
  // block: the doc simply isn't attached and generation proceeds without it.)
  const canGenerate = allAnswered && uploadState !== "uploading"

  // One entry per ANSWERED question — unanswered ones are omitted (no
  // server-side required-count check). Multi-select chips + any "Other" text
  // are joined into a single comma-separated string per the API contract.
  const buildAnswersPayload = (): GenerateBriefAnswer[] =>
    questions.reduce<GenerateBriefAnswer[]>((acc, q, i) => {
      const a = answers[i]
      if (!a) return acc
      const parts = [...a.selected, a.freeText.trim()].filter(Boolean)
      if (parts.length === 0) return acc
      acc.push({ question_id: q.id, answer: parts.join(", ") })
      return acc
    }, [])

  const handleGenerate = () => {
    if (!canGenerate) return
    storeKickoffAnswers(id, buildAnswersPayload())
    router.push(`/pm/cycles/${id}/kickoff/review`)
  }

  if (cycleLoading || questionsLoading) return <PageLoader />

  const status = (questionsError as { status?: number } | null)?.status

  return (
    <div>
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex items-start gap-3">
          <Link href={backHref}>
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
        <Stepper current={1} />

        {/* ── Access error (403 / 404) ── */}
        {questionsError && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5">
            <ShieldAlert className="h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="font-semibold text-red-800">
                {status === 403
                  ? "You don't have access to this cycle"
                  : "Cycle not found"}
              </p>
              <p className="mt-0.5 text-sm text-red-700">
                {status === 403
                  ? "This cycle belongs to a different project manager."
                  : "It may have been removed, or the link is incorrect."}
              </p>
              <Link href="/pm/cycles" className="mt-3 inline-block">
                <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100">
                  Back to All Cycles
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* ── Pending / not-yet-generated state ── */}
        {!questionsError && surveyData && total === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-muted p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="font-semibold text-foreground">Questions aren&apos;t ready yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              The question set for this cycle hasn&apos;t been generated. Check back shortly, or contact support if this persists.
            </p>
          </div>
        )}

        {/* ── Questionnaire ── */}
        {!questionsError && total > 0 && (
          <>
            {/* Intro + progress */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground">A few quick questions</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Pick the closest option for each — or write your own. Your answers shape the AI-drafted brief.
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-medium text-muted-foreground">
                  <span className="text-foreground">{answeredCount}</span> of {total} answered
                </p>
                <div className="mt-1.5 h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-indigo-600 transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Question cards */}
            <div className="space-y-4">
              {questions.map((q, i) => {
                const a = answers[i] ?? emptyAnswer
                const answered = isAnswered(a)
                const otherLabel = otherLabelOf(q)

                return (
                  <div
                    key={i}
                    className={cn(
                      "rounded-2xl border bg-card p-5 shadow-sm transition-colors",
                      answered ? "border-indigo-200" : "border-border",
                    )}
                  >
                    {/* Question header */}
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          answered
                            ? "bg-indigo-100 text-indigo-700"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold leading-snug text-foreground">{q.text}</p>
                      </div>
                      {answered && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                          <Check className="h-3 w-3" /> Answered
                        </span>
                      )}
                    </div>

                    {/* Chip-select (with inline "Other…" pill) or plain free-text */}
                    {otherLabel !== null ? (
                      <div className="mt-4 flex flex-wrap gap-2 pl-9">
                        {(q.options ?? []).slice(0, -1).map((opt, optIdx) => {
                          const selected = a.selected.includes(opt)
                          return (
                            <button
                              key={optIdx}
                              type="button"
                              onClick={() => toggleChip(i, opt)}
                              className={cn(
                                "rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
                                selected
                                  ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                                  : "border-border bg-background text-foreground hover:border-indigo-300 hover:bg-accent",
                              )}
                            >
                              {opt}
                            </button>
                          )
                        })}
                        {/* Independent of chip selection — can be filled in alongside any number of picked chips */}
                        <input
                          type="text"
                          value={a.freeText}
                          onChange={(e) => setFreeText(i, e.target.value)}
                          placeholder="Other…"
                          className={cn(
                            "min-w-[7rem] max-w-full rounded-full border px-3.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/70",
                            a.freeText.trim()
                              ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                              : "border-dashed border-muted-foreground/40 bg-background focus:border-indigo-400",
                          )}
                        />
                      </div>
                    ) : (
                      <div className="mt-4 pl-9">
                        <Textarea
                          value={a.freeText}
                          onChange={(e) => setFreeText(i, e.target.value)}
                          placeholder="Type your answer…"
                          rows={2}
                          className="text-sm"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Optional strategic-brief upload */}
            <div
              className={cn(
                "rounded-2xl border border-dashed p-4",
                uploadState === "error"
                  ? "border-destructive/40 bg-destructive/5"
                  : "border-indigo-200 bg-indigo-50/30",
              )}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                className="hidden"
                onChange={handleFilePick}
              />
              {briefFile ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                      uploadState === "error"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-indigo-100 text-indigo-600",
                    )}
                  >
                    {uploadState === "uploading" ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : uploadState === "error" ? (
                      <AlertTriangle className="h-5 w-5" />
                    ) : uploadState === "done" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <FileText className="h-5 w-5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{briefFile.name}</p>
                    <p
                      className={cn(
                        "text-xs",
                        uploadState === "error" ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {uploadState === "uploading"
                        ? "Uploading…"
                        : uploadState === "error"
                          ? uploadError
                          : uploadState === "done"
                            ? "Attached — will guide the AI-drafted brief"
                            : "Optional supporting brief"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={uploadState === "uploading"}
                    onClick={() => fileRef.current?.click()}
                  >
                    Replace
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={removeBrief}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" /> Remove
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                      <FileText className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Attach a strategic brief{" "}
                        <span className="font-normal text-muted-foreground">(optional)</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Already have one? Upload it to guide the draft — PDF, DOCX, DOC, or TXT.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    <Upload className="h-4 w-4" /> Upload file
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Sticky footer bar ──
          Bleeds past the shell's px-8/py-8 padding (-mx-8 -mb-8) so it spans the
          full content area and sits flush at the bottom, while its inner content
          re-pads (px-8) to align its edges with the full-width cards above. */}
      <div className="sticky bottom-0 z-10 -mx-8 -mb-8 mt-8 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center justify-between gap-4 px-8 py-3">
          <Link href={backHref}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          </Link>
          <div className="flex items-center gap-4">
            {total > 0 && (
              <span className="text-sm font-medium text-muted-foreground tabular-nums">
                {answeredCount}/{total} answered
              </span>
            )}
            <Button
              onClick={handleGenerate}
              disabled={!canGenerate}
              title={
                !allAnswered
                  ? "Answer every question to continue"
                  : uploadState === "uploading"
                    ? "Wait for the document to finish uploading"
                    : undefined
              }
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {uploadState === "uploading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate brief
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Two-step progress indicator ─────────────────────────────────────────── */
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
                    ? "bg-indigo-100 text-indigo-700"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {done ? <CheckCircle2 className="h-4 w-4" /> : s.n}
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
              <div className="mx-4 h-px flex-1 bg-border" />
            )}
          </div>
        )
      })}
    </div>
  )
}
