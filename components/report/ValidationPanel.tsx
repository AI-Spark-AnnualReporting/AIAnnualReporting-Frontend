"use client"

import { AlertTriangle, Check, FileQuestion } from "lucide-react"

import type { ReportValidation } from "@/lib/api/pm"

/* What the validation found, for the PM.
 *
 * Everything here stays on screen. Only the traced-figure ratio is printed in
 * the annual report, because the rest are model judgements and a wrong
 * judgement in a board document is worse than no page at all.
 *
 * Findings never block approval or export — they are weighed, not enforced. */

export function ValidationPanel({ validation }: { validation: ReportValidation }) {
  const {
    figures_total: total,
    figures_traced: traced,
    sections_unchecked: unchecked,
  } = validation

  const groups = [
    {
      title: "Figures no department submitted",
      why: "These numbers appear in the report but in nobody's submission.",
      items: validation.untraced.map((u) => ({
        where: u.title || u.section_code,
        text: u.value,
      })),
    },
    {
      title: "Instructions left in place of an answer",
      why: "Guidance about what to write, never replaced with what happened.",
      items: validation.instruction_text.map((i) => ({
        where: i.title || i.section_code,
        text: i.line,
      })),
    },
    {
      title: "Figures that disagree",
      why: "One measure carrying different numbers in different sections.",
      items: validation.conflicts.map((c) => ({ where: c.measure, text: c.detail })),
    },
    {
      title: "The brief asked for this, no section covers it",
      why: "Explicit asks from the strategic brief that went unanswered.",
      items: validation.brief_gaps.map((b) => ({ where: b.ask, text: b.detail })),
    },
    {
      title: "Said more than once",
      why: "The same point told in more than one section.",
      items: validation.redundancy.map((r) => ({
        where: r.sections.join(", "),
        text: r.detail,
      })),
    },
    {
      title: "Against the company's house style",
      why: "Words the company's own brand voice rules out.",
      items: validation.voice.map((v) => ({
        where: v.title || v.section_code,
        text: v.phrase,
      })),
    },
  ].filter((g) => g.items.length > 0)

  const problems = groups.reduce((n, g) => n + g.items.length, 0)

  return (
    <div className="space-y-4">
      <TracedFigures traced={traced} total={total} />

      {validation.emphasis && validation.emphasis.primary_leads === false && (
        <Finding
          title="The report does not lead with your primary message"
          why={validation.emphasis.detail || ""}
          items={(validation.emphasis.missing || []).map((m) => ({
            where: m,
            text: "not carried by any section",
          }))}
        />
      )}

      {groups.map((g) => (
        <Finding key={g.title} title={g.title} why={g.why} items={g.items} />
      ))}

      {problems === 0 && !unchecked.length && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-5 py-4">
          <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" strokeWidth={3} />
          <div>
            <p className="text-sm font-bold text-emerald-900">Nothing to fix</p>
            <p className="mt-0.5 text-sm text-emerald-800">
              Every figure traces to a department, and no section contradicts another.
            </p>
          </div>
        </div>
      )}

      {unchecked.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
          <FileQuestion className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          <div className="min-w-0">
            {/* Not a clean bill of health. These sections were never read, and
                saying so is the whole point — a silent gap would read as a pass. */}
            <p className="text-sm font-bold text-slate-700">
              {unchecked.length} section{unchecked.length === 1 ? "" : "s"} could not be checked
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              The check did not complete for these. Validate again to cover them:{" "}
              {unchecked.join(", ")}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

/* The one number that also gets printed in the report. Stated as a fraction
   rather than a percentage: "118 of 124" says how much was checked as well as
   how much passed, and a lone percentage hides the denominator. */
function TracedFigures({ traced, total }: { traced: number; total: number }) {
  if (!total) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
        <p className="text-sm text-slate-500">
          This report states no figures, so there was nothing to trace.
        </p>
      </div>
    )
  }

  const all = traced === total
  return (
    <div
      className={
        all
          ? "rounded-2xl border border-emerald-200 bg-emerald-50/70 px-5 py-4"
          : "rounded-2xl border border-slate-200 bg-white px-5 py-4"
      }
    >
      <p className="text-2xl font-extrabold tracking-tight text-[#1A1D2E]">
        {traced} of {total}
      </p>
      <p className="mt-0.5 text-sm text-slate-600">
        figures trace to a department&apos;s recorded submission
      </p>
      <p className="mt-2 text-xs text-slate-400">
        This line is the only part of the validation printed in the report itself.
      </p>
    </div>
  )
}

function Finding({
  title,
  why,
  items,
}: {
  title: string
  why: string
  items: { where: string; text: string }[]
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/60">
      <div className="border-b border-amber-100 px-5 py-3">
        <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {title}
          <span className="font-semibold text-amber-700">· {items.length}</span>
        </p>
        {why && <p className="mt-0.5 text-xs text-amber-800">{why}</p>}
      </div>
      <ul className="divide-y divide-amber-100/70">
        {items.map((item, i) => (
          <li key={`${item.where}-${i}`} className="flex gap-4 px-5 py-2.5">
            <span className="w-40 shrink-0 truncate text-xs font-semibold text-amber-900">
              {item.where}
            </span>
            <span className="min-w-0 text-sm text-slate-700">{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
