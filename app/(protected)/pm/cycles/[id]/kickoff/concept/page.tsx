"use client"

import { use, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { pmApi, ConceptMessage, CycleBriefFields } from "@/lib/api/pm"
import { PageLoader } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { KickoffStepper } from "@/components/pm/kickoff-stepper"
import { KickoffBuildLoader } from "@/components/pm/kickoff-build-loader"
import { ApproveDeadlineDialog } from "@/components/pm/approve-deadline-dialog"
import { ConceptMessageCard } from "@/components/report/ConceptMessageCard"
import { primaryIndexOf } from "@/lib/conceptMessages"
import { cn, formatDate } from "@/lib/utils"
import { toast } from "sonner"
import {
  ArrowLeft, Check, CheckCircle2, Loader2, MessageSquareQuote, Plus, RefreshCw,
  ShieldAlert, Sparkles,
} from "lucide-react"

/* ────────────────────────────────────────────────────────────────────────────
   STRATEGIC BRIEF — Step 3: Concept messages

   One message per area of focus, written by the concept-message agent.
   A message is `title` (two words, written FROM the copy — no longer the area's
   slogan) + `description` (three paragraphs of 100–120 words split by blank
   lines), plus an optional `role` and the `area_slogan` it was written from
   (shown on the card, never edited here).

   Picking a primary writes BOTH markers: the message is tagged
   `role: "primary"` (siblings "secondary") and moved to the top. Reading
   prefers the tag and falls back to position, so messages stored before `role`
   existed still resolve. Every mutation spreads the message rather than
   rebuilding it, which is what keeps `area_slogan` alive through a save.

   Endpoint contract worth remembering:
     - GET  concept-messages          → whatever is stored; empty = not generated
     - POST concept-messages/generate → no body, slow, ALREADY SAVED on return
     - POST concept-messages/refine   → whole list + instruction, ALREADY SAVED
     - PUT  concept-messages          → whole list; a partial array overwrites
   So generate/refine are never followed by a save, and every write sends the
   full list with adds/deletes/edits already applied locally.

   Generation failure is a 200 with an EMPTY list, not an error status — hence
   the explicit length checks rather than trusting the status code.

   Primary is positional, not a stored flag — see makePrimary below.
──────────────────────────────────────────────────────────────────────────── */

/** Tag the chosen message primary and every other one secondary, in place. */
const tagRoles = (list: ConceptMessage[], idx: number): ConceptMessage[] =>
  list.map((m, i): ConceptMessage => ({ ...m, role: i === idx ? "primary" : "secondary" }))

/** Tag, then float the primary to the top — so the tag and the ordering can
 *  never disagree, whichever of the two the server ends up honouring. */
const withPrimary = (list: ConceptMessage[], idx: number): ConceptMessage[] => {
  const tagged = tagRoles(list, idx)
  return [tagged[idx], ...tagged.filter((_, i) => i !== idx)]
}

export default function ConceptMessagesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const qc = useQueryClient()
  const { data: pmData, isLoading: cycleLoading } = usePMCycleDashboard(id)

  const cycle = (pmData as { cycle?: CycleBriefFields } | undefined)?.cycle

  const [messages, setMessages] = useState<ConceptMessage[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  // One flag for every AI call — they're 10-40s, so the whole screen freezes
  // rather than letting a second request race the first.
  const [busy, setBusy] = useState<"generate" | "refine" | "save" | "primary" | null>(null)
  // Local edits not yet PUT. Generate/refine clear it: they save server-side.
  const [dirty, setDirty] = useState(false)
  const loadedRef = useRef(false)

  // Load once the cycle is known. Without a brief there are no areas of focus
  // to write messages against, so send the PM back to the start of the wizard.
  useEffect(() => {
    if (loadedRef.current || cycleLoading) return
    loadedRef.current = true
    if (!cycle?.kickoff_brief?.trim()) {
      router.replace(`/pm/cycles/${id}/kickoff`)
      return
    }
    pmApi
      .getConceptMessages(id)
      // Generation already returns them primary-area-first, so the stored order
      // is authoritative — don't re-sort it.
      .then((data) => setMessages(data.concept_messages ?? []))
      .catch((err) => {
        console.error("[concept-messages] load failed", err)
        setLoadError(true)
        setMessages([])
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleLoading])

  const list = messages ?? []

  const primaryIndex = primaryIndexOf(list)

  /**
   * Promote a message to primary: tag it `role: "primary"` (siblings become
   * "secondary") AND move it to the top. Both markers are written because only
   * one of them survives today — the backend ignores `role` until the field
   * exists, and reads order not at all — so sending both means the choice
   * sticks either way.
   */
  const makePrimary = async (idx: number) => {
    if (busy || idx === primaryIndex) return
    const next = withPrimary(list, idx)
    const prev = list
    setBusy("primary")
    setMessages(next) // optimistic — it jumps to the top immediately
    try {
      await pmApi.saveConceptMessages(id, next)
      setDirty(false)
      qc.invalidateQueries({ queryKey: ["pm", "cycle", id] })
      toast.success(`"${list[idx].title || "This message"}" is now the primary message.`)
    } catch (err) {
      setMessages(prev)
      toast.error((err as { message?: string })?.message || "Couldn't change the primary message.")
    } finally {
      setBusy(null)
    }
  }

  // Local-only mutations — nothing reaches the server until Save.
  const edit = (next: ConceptMessage[]) => {
    setMessages(next)
    setDirty(true)
  }
  const updateTitle = (idx: number, value: string) =>
    edit(list.map((m, i) => (i === idx ? { ...m, title: value } : m)))
  const updateDescription = (idx: number, value: string) =>
    edit(list.map((m, i) => (i === idx ? { ...m, description: value } : m)))
  const removeMessage = (idx: number) => edit(list.filter((_, i) => i !== idx))
  const addMessage = () => edit([...list, { title: "", description: "", role: "secondary" }])

  const generate = async () => {
    if (busy) return
    setBusy("generate")
    try {
      const data = await pmApi.generateConceptMessages(id)
      const next = data.concept_messages ?? []
      // A soft failure answers 200 with nothing in it — say so instead of
      // silently wiping the screen.
      if (next.length === 0) {
        toast.error("Generation didn't produce any concept messages — try again.")
        return
      }
      setMessages(next)
      setDirty(false) // generate already persisted this
      qc.invalidateQueries({ queryKey: ["pm", "cycle", id] })
      toast.success(`Generated ${next.length} concept message${next.length === 1 ? "" : "s"}.`)
    } catch (err) {
      toast.error((err as { message?: string })?.message || "Couldn't generate concept messages.")
    } finally {
      setBusy(null)
    }
  }

  // Per-card refine. The endpoint only accepts the WHOLE list — sending one
  // message would persist it as the entire set — so the scoping lives in the
  // prompt, the same way the areas-of-focus screen does it.
  const refine = async (instruction: string, idx?: number): Promise<boolean> => {
    if (busy) return false
    setBusy("refine")
    try {
      const scoped =
        idx === undefined
          ? instruction
          : `Only modify concept message ${idx + 1}` +
            (list[idx]?.title ? ` ("${list[idx].title}")` : "") +
            `: ${instruction}. Leave every other message exactly as it is, in the same order.`
      const data = await pmApi.refineConceptMessages(id, {
        concept_messages: list,
        instruction: scoped,
      })
      const next = data.concept_messages ?? []
      if (next.length === 0) {
        toast.error("Refine came back empty — your messages are unchanged.")
        return false
      }
      setMessages(next)
      setDirty(false) // refine already persisted this
      qc.invalidateQueries({ queryKey: ["pm", "cycle", id] })
      return true
    } catch (err) {
      toast.error((err as { message?: string })?.message || "Couldn't refine the concept messages.")
      return false
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    if (busy || !dirty) return
    setBusy("save")
    try {
      // Stamp the roles from what's on screen, so every save carries exactly
      // one primary — including the first save after a generate, where the
      // backend hasn't tagged anything yet.
      const payload = primaryIndex >= 0 ? tagRoles(list, primaryIndex) : list
      await pmApi.saveConceptMessages(id, payload)
      setMessages(payload)
      setDirty(false)
      qc.invalidateQueries({ queryKey: ["pm", "cycle", id] })
      toast.success("Concept messages saved.")
    } catch (err) {
      toast.error((err as { message?: string })?.message || "Couldn't save your changes.")
    } finally {
      setBusy(null)
    }
  }

  // ── Approve & use → set the questions deadline ────────────────────────────
  // This is the last screen of the wizard, so it owns the deadline modal and
  // the kickoff pipeline that used to sit on Step 2.
  const todayIso = new Date().toISOString().slice(0, 10)
  const [approveOpen, setApproveOpen] = useState(false)
  const [deadlineInput, setDeadlineInput] = useState("")
  // How many questions to generate per department (5-20, backend default 12).
  const [numQuestions, setNumQuestions] = useState(12)
  const [approving, setApproving] = useState(false)

  const canApproveNow = list.length > 0 && !dirty && !busy

  const openApprove = () => {
    if (!canApproveNow) return
    // Pre-fill with an already-saved deadline if the cycle has one.
    setDeadlineInput(cycle?.questions_deadline?.slice(0, 10) ?? "")
    setApproveOpen(true)
  }

  const deadlineValid = !!deadlineInput && deadlineInput >= todayIso
  const numQuestionsValid = numQuestions >= 5 && numQuestions <= 20
  const approveValid = deadlineValid && numQuestionsValid

  // Kicks off the cycle for real: fires the AI question-generation pipeline for
  // every department (POST /pm/kickoff) using the approved brief and the chosen
  // question count, then persists the deadline.
  const confirmApprove = async () => {
    if (!approveValid || !cycle?.kickoff_brief || approving) return
    setApproving(true)
    try {
      // 1) Generate the questions. This is the long call (~up to 3 min).
      await pmApi.submitKickoff({
        cycle_id: id,
        strategic_brief: cycle.kickoff_brief,
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
    }
  }

  const fiscalLabel =
    cycle?.cycle_name ??
    (cycle?.fiscal_year ? `FY${cycle.fiscal_year} Annual Report` : "Annual Report")

  const backHref = `/pm/cycles/${id}/kickoff/review`

  if (cycleLoading || messages === null) return <PageLoader />

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
              Concept Messages
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {fiscalLabel} · The narrative behind each area of focus.
            </p>
          </div>
        </div>

        {/* ── Stepper ── */}
        <KickoffStepper current={3} />

        {loadError && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800">
              Couldn&apos;t load existing concept messages. You can still generate a fresh set —
              doing so replaces whatever is stored.
            </p>
          </div>
        )}

        {/* ── Concept messages ── */}
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                <MessageSquareQuote className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-foreground">Concept Messages</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  One per area of focus, primary first. Edit the title and description, refine
                  either with AI, or pick a different message as primary.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SaveState dirty={dirty} saving={busy === "save"} />
              <Button size="sm" variant="outline" onClick={addMessage} disabled={!!busy}>
                <Plus className="h-3.5 w-3.5" /> Add concept message
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={generate}
                disabled={!!busy}
                title={
                  list.length > 0
                    ? "Regenerate every message from the current areas of focus — replaces the list"
                    : undefined
                }
              >
                {busy === "generate" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : list.length > 0 ? (
                  <RefreshCw className="h-3.5 w-3.5" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {list.length > 0 ? "Regenerate" : "Generate"}
              </Button>
              <Button
                size="sm"
                onClick={save}
                disabled={!!busy || !dirty}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {busy === "save" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Save
              </Button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {list.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-muted p-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
                  <Sparkles className="h-5 w-5 text-indigo-600" />
                </div>
                <p className="font-semibold text-foreground">No concept messages yet</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Generate one message per area of focus, then edit or refine them. This takes
                  up to a minute.
                </p>
                <Button
                  onClick={generate}
                  disabled={!!busy}
                  className="bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  {busy === "generate" ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                  ) : (
                    <><Sparkles className="h-4 w-4" /> Generate concept messages</>
                  )}
                </Button>
              </div>
            ) : (
              list.map((m, i) => (
                <ConceptMessageCard
                  key={i}
                  index={i}
                  title={m.title}
                  description={m.description}
                  areaSlogan={m.area_slogan}
                  isPrimary={i === primaryIndex}
                  primaryGroup="concept-message-primary"
                  disabled={!!busy}
                  onTitleChange={(v) => updateTitle(i, v)}
                  onDescriptionChange={(v) => updateDescription(i, v)}
                  onMakePrimary={() => makePrimary(i)}
                  onRemove={() => removeMessage(i)}
                  onRefine={(ins) => refine(ins, i)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Sticky footer bar ── */}
      <div className="sticky bottom-0 z-10 -mx-8 -mb-8 mt-8 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center justify-between gap-4 px-8 py-3">
          <Link href={backHref}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          </Link>
          <Button
            disabled={!canApproveNow}
            onClick={openApprove}
            title={
              list.length === 0
                ? "Generate at least one concept message first"
                : dirty
                  ? "Save your changes first"
                  : undefined
            }
            className="bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <CheckCircle2 className="h-4 w-4" /> Approve &amp; use
          </Button>
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
      />

      {/* Full-screen loader while the kickoff pipeline generates questions.
          Sits above the (still-open) dialog via its own fixed inset-0 z-[100]. */}
      {approving && <KickoffBuildLoader />}
    </div>
  )
}

/* ── Unsaved / saving indicator ──────────────────────────────────────────── */
function SaveState({ dirty, saving }: { dirty: boolean; saving: boolean }) {
  if (saving) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
      </span>
    )
  }
  if (!dirty) return null
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-amber-600")}>
      <ShieldAlert className="h-3.5 w-3.5" /> Unsaved changes
    </span>
  )
}
