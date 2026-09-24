"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertTriangle, Check, CheckCircle2, Loader2, Pencil, RotateCcw, Trash2, X } from "lucide-react"

import { useResolveFinding } from "@/hooks/useReportBuilder"
import type { DraftFinding, FindingSide } from "@/lib/api/pm"
import { cn, formatDateTime } from "@/lib/utils"

/* The list of things to check before building the report.
 *
 * This is the last point where a correction still reaches the report: every
 * downstream consumer reads a department's final_submission, and the PM edits
 * that text here. Each department's HOD approves without seeing any other
 * department's draft, so a figure that contradicts another department is
 * invisible until all of them sit together — which is here.
 *
 * A list only. Running the analysis, the loader and the page header belong to
 * the page that renders this. */

const KIND_LABEL: Record<DraftFinding["kind"], string> = {
  invented_claim: "Unsupported claim",
  figure_conflict: "Figures disagree",
}

// "open" carries no note — it is the branch that still shows action buttons —
// but it stays in the map so indexing by the full status union stays type-safe.
const STATUS_NOTE: Record<DraftFinding["status"], string> = {
  open: "",
  corrected: "Corrected",
  removed: "Sentence removed",
  accepted: "Marked correct",
}

/* One sentence stating the disagreement in words, built from the values we now
   hold. "Both are company-wide figures, so they should agree" is the part that
   makes a finding actionable — a department-level figure would never have been
   flagged, so seeing that spelled out tells the PM when the model got the scope
   wrong and they can clear it. */
function conflictSummary(finding: DraftFinding): string | null {
  if (finding.kind !== "figure_conflict" || finding.sides.length < 2) return null

  const stated = finding.sides
    .filter((s) => s.value)
    .map((s) => `${s.department} states ${s.value}`)
  if (stated.length < 2) return null

  const period = finding.sides.find((s) => s.period)?.period
  const allCompany = finding.sides.every((s) => s.scope === "company")

  const scopeNote = allCompany
    ? " Both are company-wide figures, so they should agree."
    : ""
  const periodNote = period ? ` for ${period}` : ""

  return `${stated.join("; ")}${periodNote}.${scopeNote}`
}

/* What the sentence says in the report right now. A corrected finding keeps the
   original in `side.sentence` as its audit record, so the live text lives on
   the resolution. */
function currentText(finding: DraftFinding, side: FindingSide): string {
  const res = finding.resolution
  if (!res || res.session_id !== side.session_id) return side.sentence
  if (res.action === "edited" && res.to) return res.to
  return side.sentence
}

/* Whether this side's text was actually changed, so the original is worth
   showing underneath. "Accepted" changed nothing, so it is not. */
function wasRewritten(finding: DraftFinding, side: FindingSide): boolean {
  const res = finding.resolution
  if (!res || res.session_id !== side.session_id) return false
  return res.action === "edited" || res.action === "removed"
}

export function DraftFindingsPanel({
  cycleId,
  findings,
}: {
  cycleId: string
  findings: DraftFinding[]
}) {
  const resolve = useResolveFinding(cycleId)

  // Which side is being edited, keyed "findingId::sessionId" so two sides of
  // one conflict can't both open at once.
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draftText, setDraftText] = useState("")

  const startEdit = (finding: DraftFinding, side: FindingSide) => {
    setEditingKey(`${finding.id}::${side.session_id}`)
    setDraftText(side.sentence)
  }

  const cancelEdit = () => {
    setEditingKey(null)
    setDraftText("")
  }

  const submitEdit = (finding: DraftFinding, side: FindingSide) => {
    if (!draftText.trim()) return
    resolve.mutate(
      {
        findingId: finding.id,
        payload: {
          action: "edited",
          session_id: side.session_id,
          sentence: draftText.trim(),
        },
      },
      { onSuccess: cancelEdit },
    )
  }

  const removeSentence = (finding: DraftFinding, side: FindingSide) =>
    resolve.mutate({
      findingId: finding.id,
      payload: { action: "removed", session_id: side.session_id },
    })

  const accept = (finding: DraftFinding) =>
    resolve.mutate({ findingId: finding.id, payload: { action: "accepted" } })

  const undo = (finding: DraftFinding) =>
    resolve.mutate({ findingId: finding.id, payload: { action: "undo" } })

  return (
    <div className="space-y-3">
      {findings.map((finding) => {
        const isOpen = finding.status === "open"
        const summary = conflictSummary(finding)
        return (
          <div
            key={finding.id}
            className={cn(
              "rounded-xl border p-4",
              isOpen ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50",
            )}
          >
            <div className="flex items-start gap-2.5">
              {isOpen ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-xs font-bold uppercase tracking-wide",
                    isOpen ? "text-amber-700" : "text-slate-500",
                  )}
                >
                  {KIND_LABEL[finding.kind]} — {finding.label}
                </p>
                {finding.detail && (
                  <p className={cn("mt-1 text-sm", isOpen ? "text-amber-900" : "text-slate-500")}>
                    {finding.detail}
                  </p>
                )}
                {summary && (
                  <p className={cn("mt-1 text-sm", isOpen ? "text-amber-900" : "text-slate-500")}>
                    {summary}
                  </p>
                )}

                <div className="mt-3 space-y-2">
                  {finding.sides.map((side) => {
                    const key = `${finding.id}::${side.session_id}`
                    const isEditing = editingKey === key
                    return (
                      <div
                        key={side.session_id}
                        className="rounded-lg border border-white bg-white/70 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Link
                            href={`/pm/sessions/${side.session_id}`}
                            className="text-[11px] font-bold text-[#4040c8] hover:underline"
                          >
                            {side.department}
                          </Link>
                          {side.value && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                              {side.value}
                            </span>
                          )}
                        </div>

                        {isEditing ? (
                          <>
                            <textarea
                              value={draftText}
                              onChange={(e) => setDraftText(e.target.value)}
                              rows={3}
                              autoFocus
                              className="mt-2 w-full resize-y rounded-lg border border-slate-200 p-2.5 text-sm text-slate-800 outline-none focus:border-[#4040c8] focus:ring-2 focus:ring-[#4040c8]/20"
                            />
                            <div className="mt-2 flex justify-end gap-2">
                              <button
                                onClick={cancelEdit}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                              >
                                <X className="h-3 w-3" /> Cancel
                              </button>
                              <button
                                onClick={() => submitEdit(finding, side)}
                                disabled={!draftText.trim() || resolve.isPending}
                                className="inline-flex items-center gap-1 rounded-lg bg-[#4040c8] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#3535a8] disabled:opacity-40"
                              >
                                {resolve.isPending ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Check className="h-3 w-3" />
                                )}
                                Save
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            {/* After a correction the finding still stores the
                                sentence as it was when flagged — that is the
                                audit record. What the PM wants to see is what
                                the report says NOW, with the original kept
                                underneath. */}
                            <p className="mt-1.5 text-sm leading-relaxed text-slate-700">
                              &ldquo;{currentText(finding, side)}&rdquo;
                            </p>
                            {wasRewritten(finding, side) && (
                              <p className="mt-1 text-[11px] text-slate-400">
                                {finding.resolution?.action === "removed"
                                  ? "removed: "
                                  : "was: "}
                                &ldquo;{side.sentence}&rdquo;
                              </p>
                            )}
                            {side.question && (
                              <p className="mt-1 text-[11px] text-slate-400">
                                answering: &ldquo;{side.question}&rdquo;
                              </p>
                            )}
                          </>
                        )}

                        {isOpen && !isEditing && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              onClick={() => startEdit(finding, side)}
                              disabled={resolve.isPending}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                            >
                              <Pencil className="h-3 w-3" /> Edit
                            </button>
                            {/* Removal only for invented claims: deleting one
                                side of a disagreement hides the conflict
                                instead of settling it. */}
                            {finding.kind === "invented_claim" && (
                              <button
                                onClick={() => removeSentence(finding, side)}
                                disabled={resolve.isPending}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                              >
                                <Trash2 className="h-3 w-3" /> Remove sentence
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {isOpen ? (
                  <button
                    onClick={() => accept(finding)}
                    disabled={resolve.isPending}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <Check className="h-3 w-3" /> Looks right
                  </button>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <p className="text-[11px] font-semibold text-emerald-700">
                      {STATUS_NOTE[finding.status]}
                      {finding.resolution?.at ? ` · ${formatDateTime(finding.resolution.at)}` : ""}
                    </p>
                    <button
                      onClick={() => undo(finding)}
                      disabled={resolve.isPending}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <RotateCcw className="h-3 w-3" /> Undo
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
