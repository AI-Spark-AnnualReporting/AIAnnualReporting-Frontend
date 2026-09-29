"use client"

import { useState } from "react"
import { AlertTriangle, Check, ChevronDown, FileQuestion } from "lucide-react"

import type { ReportValidation } from "@/lib/api/pm"
import { cn } from "@/lib/utils"

/* What the validation found, for the PM.
 *
 * Everything here stays on screen. Only the traced-figure count is printed in
 * the annual report, because the rest are model judgements and a wrong
 * judgement in a board document is worse than no page at all.
 *
 * Findings never block approval or export — they are weighed, not enforced. */

const SHOWN = 6

export function ValidationPanel({ validation }: { validation: ReportValidation }) {
  const {
    figures_total: total,
    figures_traced: traced,
    sections_unchecked: unchecked,
  } = validation

  // Denominators. A percentage with no stated base is decoration, so a group
  // only carries one when there is a real number to divide by.
  const checked = validation.coverage?.sections_checked ?? 0
  const toneBase = validation.coverage?.tone_sections ?? checked
  const conceptBase = validation.coverage?.concept_sections ?? checked
  const bySource = validation.figures_by_source
  const messages = validation.coverage
    ? validation.coverage.secondary.length + (validation.coverage.primary ? 1 : 0)
    : 0
  const instructionSections = new Set(
    validation.instruction_text.map((i) => i.section_code),
  ).size
  // Sections the house style does not govern. Reporting a banned word in an
  // auditor's report is noise the PM cannot act on - the wording is mandated,
  // and it no longer counts against the score either, so listing it only
  // invites a fix that must not be made.
  const toneExempt = new Set(
    (validation.coverage?.excluded ?? [])
      .filter((e) => !e.tone)
      .map((e) => e.section_code),
  )
  const voiceFindings = validation.voice.filter(
    (v) => !toneExempt.has(v.section_code),
  )
  const voiceSections = new Set(voiceFindings.map((v) => v.section_code)).size
  // Every measure the check named across the report. Pass 1 tags each figure
  // with its measure, so this is a real count of what was examined - not a
  // count of every distinct quantity a reader might recognise, which is why the
  // reason line says "measures the check identified" rather than "measures".
  // Section codes are what the findings store; the titles live on pass 1's
  // per-section review. Every other card already shows a title, so a card
  // showing STRATEGY_OBJECTIVES reads as a different kind of thing entirely.
  const titleOf = (code: string) =>
    validation.sections?.[code]?.title || prettifyCode(code)

  const repeatedSections = new Set(
    validation.redundancy.flatMap((r) => r.sections),
  ).size
  const measures = new Set(
    Object.values(validation.sections ?? {}).flatMap((section) =>
      (section.figures ?? [])
        .map((f) => (f.measure ?? "").trim().toLowerCase())
        .filter(Boolean),
    ),
  ).size

  const groups: FindingGroup[] = [
    {
      key: "untraced",
      title: "Figures with no recorded source",
      why:
        "Not in any department's submission, and not in any document uploaded to this cycle.",
      items: bySentence(validation.untraced),
      count: validation.untraced.length,
      percent: bySource && total ? Math.round((bySource.neither / total) * 100) : null,
      reason: bySource
        ? `${bySource.neither.toLocaleString()} of the report's ${total.toLocaleString()} figure mentions matched neither source. The ${validation.untraced.length} distinct figures behind them are listed here.`
        : `${validation.untraced.length} distinct figures matched nothing on file.`,
    },
    {
      key: "instruction",
      title: "Instructions left in place of an answer",
      why: "Guidance about what to write, never replaced with what happened.",
      percent:
        checked && instructionSections
          ? Math.round((instructionSections / checked) * 100)
          : null,
      reason: checked
        ? `${instructionSections} of the ${checked} sections checked still ${instructionSections === 1 ? "carries" : "carry"} ${validation.instruction_text.length} such line${validation.instruction_text.length === 1 ? "" : "s"}.`
        : `${validation.instruction_text.length} line${validation.instruction_text.length === 1 ? "" : "s"} describe what to write rather than what happened.`,
      items: validation.instruction_text.map((i) => ({
        where: i.title || i.section_code,
        lead: [],
        detail: i.line,
      })),
    },
    {
      key: "conflicts",
      title: "Figures that disagree",
      why: "One measure carrying different numbers in different sections.",
      percent: measures
        ? Math.round((validation.conflicts.length / measures) * 100)
        : null,
      reason: measures
        ? `${validation.conflicts.length} of the ${measures} measures the check identified ${validation.conflicts.length === 1 ? "carries" : "carry"} more than one value.`
        : `${validation.conflicts.length} measure${validation.conflicts.length === 1 ? " carries" : "s carry"} more than one value across the report.`,
      items: validation.conflicts.map((c) => ({
        where: c.measure,
        lead: [],
        detail: c.detail,
      })),
    },
    {
      key: "brief",
      title: "Asked for in the brief, covered nowhere",
      why: "Explicit asks from the strategic brief that went unanswered.",
      percent: validation.brief_asks_total
        ? Math.round((validation.brief_gaps.length / validation.brief_asks_total) * 100)
        : null,
      reason: validation.brief_asks_total
        ? `${validation.brief_gaps.length} of the ${validation.brief_asks_total} explicit asks in the strategic brief ${validation.brief_gaps.length === 1 ? "is" : "are"} covered by no section.`
        : `${validation.brief_gaps.length} thing${validation.brief_gaps.length === 1 ? "" : "s"} the brief asks for that no section covers.`,
      items: validation.brief_gaps.map((b) => ({
        where: b.ask,
        lead: [],
        detail: b.detail,
      })),
    },
    {
      key: "redundancy",
      title: "Redundancy",
      why: "The same point told in more than one section.",
      // Sections, not findings: a finding is a PAIR of sections, so dividing
      // findings by sections would compare two different things. Two findings
      // can involve three sections, which is what the reader needs to know.
      percent:
        checked && repeatedSections
          ? Math.round((repeatedSections / checked) * 100)
          : null,
      reason: checked
        ? `${repeatedSections} of the ${checked} sections checked ${repeatedSections === 1 ? "repeats" : "repeat"} a point another section already makes.`
        : `${validation.redundancy.length} point${validation.redundancy.length === 1 ? " appears" : "s appear"} in more than one section.`,
      items: validation.redundancy.map((r) => ({
        where: r.sections.map(titleOf).join(", "),
        lead: [],
        detail: r.detail,
      })),
    },
    {
      key: "voice",
      title: "Against the company's house style",
      why: "Words the company's own brand voice rules out.",
      percent:
        toneBase && voiceSections
          ? Math.round((voiceSections / toneBase) * 100)
          : null,
      reason: toneBase
        ? `${voiceSections} of the ${toneBase} sections your house style governs ${voiceSections === 1 ? "uses" : "use"} a word its rules forbid.`
        : `${voiceFindings.length} use${voiceFindings.length === 1 ? "" : "s"} of a word the company's stored rules forbid.`,
      items: voiceFindings.map((v) => ({
        where: v.title || v.section_code,
        lead: [v.phrase],
        detail: "",
      })),
    },
    {
      key: "uncarried",
      title: "Concept messages no section carries",
      why: "Chosen for the report, then never picked up by any section.",
      percent: messages
        ? Math.round(
            ((validation.coverage?.secondary ?? [])
              .concat(validation.coverage?.primary ? [validation.coverage.primary] : [])
              .filter((m) => m.sections === 0).length /
              messages) *
              100,
          )
        : null,
      reason: `Of the ${messages} concept message${messages === 1 ? "" : "s"} chosen for this report, these appear in none of the ${conceptBase} sections a concept message can apply to.`,
      items: (validation.coverage?.secondary ?? [])
        .concat(validation.coverage?.primary ? [validation.coverage.primary] : [])
        .filter((m) => m.sections === 0)
        .map((m) => ({ where: m.title, lead: [], detail: "" })),
    },
  ].filter((g) => g.items.length > 0)

  const problems = groups.reduce((n, g) => n + (g.count ?? g.items.length), 0)

  return (
    <div className="space-y-5">
      <Overall validation={validation} />

      <Score
        traced={traced}
        total={total}
        distinct={validation.untraced.length}
        bySource={validation.figures_by_source}
      />

      <Coverage validation={validation} />

      <BriefCoverage validation={validation} />

      {groups.map((g) => (
        <Group key={g.key} group={g} />
      ))}

      {problems === 0 && unchecked.length === 0 && (
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
            {/* Not a clean bill of health. These were never read, and saying so
                is the point — a silent gap would read as a pass. */}
            <p className="text-sm font-bold text-slate-700">
              {unchecked.length} section{unchecked.length === 1 ? "" : "s"} could not be
              checked
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              Validate again to cover them: {unchecked.join(", ")}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

/* The headline. A percentage answers "how much of this is backed by something"
   at a glance; the fraction underneath keeps the denominator visible, because a
   percentage alone hides whether it was measured over ten figures or a
   thousand. */
function Score({
  traced,
  total,
  distinct,
  bySource,
}: {
  traced: number
  total: number
  /** Untraced figures counted once per section, which is what the list shows. */
  distinct: number
  /** Null on a validation stored before documents were checked. */
  bySource: ReportValidation["figures_by_source"]
}) {
  if (!total) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5">
        <p className="text-sm text-slate-500">
          This report states no figures, so there was nothing to trace.
        </p>
      </div>
    )
  }

  const pct = Math.round((traced / total) * 100)
  const tone =
    pct >= 90
      ? { bar: "bg-emerald-500", text: "text-emerald-700", ring: "border-emerald-200" }
      : pct >= 60
        ? { bar: "bg-amber-500", text: "text-amber-700", ring: "border-amber-200" }
        : { bar: "bg-rose-500", text: "text-rose-700", ring: "border-rose-200" }

  return (
    <div className={cn("rounded-2xl border bg-white px-6 py-5 shadow-sm", tone.ring)}>
      <div className="flex flex-wrap items-start gap-x-10 gap-y-6">
        <div>
          <Gauge percent={pct} className={tone.text} />
          <p className="mt-2 text-sm font-semibold text-[#1A1D2E]">
            of the figures trace to a recorded source
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            {traced.toLocaleString()} of {total.toLocaleString()} figure mentions
          </p>
        </div>

        <div>
          <Gauge percent={100 - pct} className="text-slate-300" />
          <p className="mt-2 text-sm font-semibold text-[#1A1D2E]">
            appear in no source
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            {bySource
              ? `${bySource.neither.toLocaleString()} of ${total.toLocaleString()} figure mentions`
              : `${(total - traced).toLocaleString()} of ${total.toLocaleString()} figure mentions`}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            {distinct.toLocaleString()} distinct figure{distinct === 1 ? "" : "s"} to
            check
          </p>
        </div>
      </div>

      {bySource && (
        <p className="mt-3 text-sm text-slate-500">
          <strong className="font-semibold text-[#1A1D2E]">
            {bySource.submission.toLocaleString()}
          </strong>{" "}
          from a department&rsquo;s submission &middot;{" "}
          <strong className="font-semibold text-[#1A1D2E]">
            {bySource.document.toLocaleString()}
          </strong>{" "}
          from a filed document
        </p>
      )}

      <p className="mt-3 text-xs text-slate-400">
        Years and dates are not counted. This is the only counted figure in the
        report&rsquo;s Validation Statement; the percentages below it are judged.
      </p>
    </div>
  )
}

/* Primary message, secondary messages, house style - as percentages.

   Replaces the paragraph this used to print. A sentence saying the primary
   message "is carried by fewer sections than the secondary messages" makes the
   reader do the counting; the count is what he wanted.

   Every figure is over the sections that were actually read. A batch whose
   model call failed is reported as unchecked, and folding those in would mark a
   section as not carrying the message when nobody looked at it. */
function Coverage({
  validation,
}: {
  validation: ReportValidation
}) {
  const coverage = validation.coverage
  if (!coverage || !coverage.sections_checked) return null

  const { sections_checked: checked, primary, secondary_any: secondary, tone } = coverage
  const count = coverage.secondary.length
  const reviews = validation.sections ?? {}
  // Each metric names the base it was actually scored over. Falling back to the
  // total is for validations stored before applicability was asked.
  const conceptBase = coverage.concept_sections ?? checked
  const toneBase = coverage.tone_sections ?? checked
  const excluded = coverage.excluded ?? []
  const notCounted = (key: "concept" | "tone") =>
    excluded
      .filter((e) => !e[key])
      .map((e) => ({ title: e.title, purpose: e.purpose }))

  // Which sections the model said carry a given message. This is the working
  // behind every concept percentage: without it the reader is told 67% and has
  // no way to see what was counted.
  const carriers = (title: string) => {
    const wanted = title.trim().toLowerCase()
    return Object.entries(reviews)
      .filter(([, review]) =>
        (review.concepts ?? []).some((c) => (c ?? "").trim().toLowerCase() === wanted),
      )
      .map(([code, review]) => review.title || prettifyCode(code))
  }

  // Sections a tone rule was broken in, by either check - and only sections
  // the house style actually governs. Listing the auditor's report here while
  // the same card exempts it two lines below made the score and its own working
  // disagree.
  const exemptFromTone = new Set(
    excluded.filter((e) => !e.tone).map((e) => e.section_code),
  )
  const offTone = new Set<string>([
    ...validation.voice
      .filter((v) => !exemptFromTone.has(v.section_code))
      .map((v) => v.title || prettifyCode(v.section_code)),
    ...Object.entries(reviews)
      .filter(
        ([code, r]) =>
          !exemptFromTone.has(code) &&
          ((r as { voice?: unknown[] }).voice ?? []).length > 0,
      )
      .map(([code, r]) => r.title || prettifyCode(code)),
  ])

  return (
    <div className="space-y-2">
      {/* Stacked, not side by side. Each card carries its own working now, and
          three columns of that is a wall - one full-width card per measure
          gives the evidence room to be read. */}
      <Stat
        label="Primary concept message"
        stat={primary}
        /* Not 0%. One live cycle has five messages and none marked primary,
           and a zero there reads as a failure when it means nothing was
           chosen to lead. */
        empty="No primary message was chosen for this report, so there is nothing to look for."
        reason={
          primary
            ? `“${primary.title}” is carried by ${primary.sections} of the ${conceptBase} sections a concept message can apply to.`
            : ""
        }
        evidence={primary ? [{ label: primary.title, sections: carriers(primary.title) }] : []}
        excluded={notCounted("concept")}
      />
      <Stat
        label="Secondary concept messages"
        stat={count ? secondary : null}
        empty="No secondary messages were chosen for this report."
        reason={
          count
            ? `${secondary.sections} of the ${conceptBase} sections a concept message can apply to carry at least one of your ${count} secondary message${count === 1 ? "" : "s"}.`
            : ""
        }
        excluded={notCounted("concept")}
        evidence={coverage.secondary.map((m) => ({
          label: m.title,
          sections: carriers(m.title),
        }))}
      />
      <Stat
        label="Company tone"
        stat={tone}
        /* The company stored no house style, so nothing could be checked
           against it. Showing 100% for a check that never ran would be the
           most flattering number on the page and the least true. */
        empty="No house style is saved for this company, so there are no rules to check against."
        reason={
          tone
            ? `${tone.sections} of the ${toneBase} sections your house style governs break none of its rules.`
            : ""
        }
        excluded={notCounted("tone")}
        evidence={
          offTone.size
            ? [{ label: "Broke a rule", sections: [...offTone] }]
            : []
        }
        footer={<ToneRules rules={validation.tone_rules} />}
      />
      <p className="px-1 text-xs text-slate-400">
        Judged by the model across {checked} section{checked === 1 ? "" : "s"}, and
        printed in the report under &ldquo;Assessed&rdquo;.
      </p>
    </div>
  )
}

function Stat({
  label,
  stat,
  empty,
  reason,
  evidence,
  excluded,
  footer,
}: {
  label: string
  stat: { sections: number; percent: number } | null | undefined
  /** Said in full when there is no number, so the card explains itself rather
   *  than looking like a widget that failed to load. */
  empty: string
  /** The sentence behind the percentage. A number on its own tells the reader
   *  what, never why. */
  reason: string
  /** The sections the number was counted from. The percentage is a model
   *  judgement, so the reader is owed the working rather than asked to take
   *  67% on trust. */
  evidence: { label: string; sections: string[]; unit?: string }[]
  /** Sections this metric was not asked of, and what each one is for. Shown
   *  rather than quietly dropped: a smaller denominator flatters the score, so
   *  the reader has to be able to see it and disagree. */
  excluded: { title: string; purpose: string }[]
  /** Anything else the card should carry under its working. */
  footer?: React.ReactNode
}) {
  const card = "rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm"

  if (!stat) {
    return (
      <div className={card}>
        <p className="text-sm font-semibold text-[#1A1D2E]">{label}</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{empty}</p>
      </div>
    )
  }

  const tone =
    stat.percent >= 75
      ? "text-emerald-700"
      : stat.percent >= 40
        ? "text-amber-700"
        : "text-rose-700"

  return (
    <div className={card}>
      <div className="flex items-center gap-5">
        <Gauge percent={stat.percent} className={cn("shrink-0", tone)} size="sm" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#1A1D2E]">{label}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{reason}</p>
        </div>
      </div>

      {(evidence.length > 0 || excluded.length > 0) && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
            How this was counted
          </p>
          <ul className="mt-2 space-y-1.5">
            {evidence.map((row) => (
              <li key={row.label} className="text-xs leading-relaxed">
                <span className="font-semibold text-[#1A1D2E]">{row.label}</span>
                <span className="text-slate-400">
                  {" — "}
                  {row.sections.length === 0
                    ? `no ${row.unit ?? "section"} carries it`
                    : `${row.sections.length} ${row.unit ?? "section"}${row.sections.length === 1 ? "" : "s"}: ${row.sections.join(", ")}`}
                </span>
              </li>
            ))}
          </ul>

          {excluded.length > 0 && (
            <>
              <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Not counted
              </p>
              <ul className="mt-1.5 space-y-1">
                {excluded.map((row) => (
                  <li key={row.title} className="text-xs leading-relaxed">
                    <span className="font-semibold text-[#1A1D2E]">{row.title}</span>
                    {row.purpose && (
                      <span className="text-slate-400">{` — ${row.purpose}`}</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {footer}
    </div>
  )
}

/* The rules the tone score was measured against.

   Folded by default: the card is already carrying a gauge, a sentence, its
   working and its exclusions, and this is reference material rather than a
   finding. But it has to be reachable - "3 of 9 sections break none of its
   rules" means nothing to a reader who cannot see what the rules are, and one
   of them is why `unprecedented` was flagged. */
function ToneRules({ rules }: { rules: ReportValidation["tone_rules"] }) {
  const [open, setOpen] = useState(false)
  if (!rules) return null

  const lines = ([
    ["Voice", rules.person],
    ["Register", rules.register],
    ["Sentences", rules.sentence_style],
    ["Sounds like", rules.tone_adjectives.join(" \u00b7 ")],
    ["Never use", rules.banned_words.join(" \u00b7 ")],
    ["Prefer", rules.preferred_words.join(" \u00b7 ")],
    ["Do", rules.do.join("\n")],
    ["Don\u2019t", rules.dont.join("\n")],
  ] as [string, string][]).filter(([, value]) => value.trim() !== "")

  if (lines.length === 0) return null

  // What the folded line advertises, so it is worth opening.
  const summary = [
    rules.person && "voice",
    rules.register && "register",
    rules.sentence_style && "sentence style",
    rules.banned_words.length && `${rules.banned_words.length} banned words`,
    rules.preferred_words.length && `${rules.preferred_words.length} preferred words`,
    rules.do.length && `${rules.do.length} do\u2019s`,
    rules.dont.length && `${rules.dont.length} don\u2019ts`,
  ]
    .filter(Boolean)
    .join(", ")

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-start gap-1.5 text-left"
      >
        <ChevronDown
          className={cn(
            "mt-px h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform",
            !open && "-rotate-90",
          )}
        />
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Rules checked
        </span>
        {!open && (
          <span className="min-w-0 flex-1 text-[11px] text-slate-300">{summary}</span>
        )}
      </button>

      {open && (
        <dl className="mt-2 space-y-1.5 pl-5">
          {lines.map(([label, value]) => (
            <div key={label} className="sm:flex sm:gap-3">
              <dt className="shrink-0 text-xs font-semibold text-[#1A1D2E] sm:w-24">
                {label}
              </dt>
              <dd className="whitespace-pre-line text-xs leading-relaxed text-slate-500">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

/* "strategy_objectives" -> "Strategy Objectives".

   Only a fallback: the real title comes off pass 1's review of that section.
   A section the model never returned a verdict for has no stored title, and a
   tidied code still beats a raw one. */
function prettifyCode(code: string): string {
  return code
    .split(/[_-]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

/* The percentage, inside a half-circle that fills to match it.

   The arc takes its colour from the surrounding text, so the number and its
   gauge always agree - a red 38% cannot end up drawn in green. The unfilled
   remainder is a flat grey rather than a faded tint of that colour, so "how
   much is missing" reads at a glance without depending on colour vision.

   Replaces the horizontal bar that sat under both numbers: the bar plotted the
   same percentage a third time, directly beneath two figures that already
   stated it. */
function Gauge({
  percent,
  className,
  size = "lg",
  withLabel = true,
}: {
  percent: number
  className: string
  /** "sm" for the coverage row and "xs" for a finding card's header, both of
   *  which sit below the headline and must not compete with it. Same drawing,
   *  scaled. */
  size?: "lg" | "sm" | "xs"
  /** false draws the arc bare. At card size the number cannot sit inside it -
   *  the arc's end caps close in on the text - so the caller puts it alongside. */
  withLabel?: boolean
}) {
  // The arc: a half circle of radius 58, drawn left to right over the top. The
  // viewBox is fixed and the box around it scales, so both sizes are one shape.
  const ARC = "M 12 70 A 58 58 0 0 1 128 70"
  const LENGTH = Math.PI * 58
  const shown = Math.max(0, Math.min(100, percent))

  // The smaller it is drawn, the thicker the stroke has to be in viewBox units,
  // or a scaled-down arc reads as a hairline beside the big one.
  const box = {
    lg: "h-[78px] w-[140px]",
    sm: "h-[56px] w-[100px]",
    xs: "h-[36px] w-[64px]",
  }[size]
  const weight = { lg: 9, sm: 11, xs: 15 }[size]
  const label = {
    lg: "bottom-1 text-[2rem]",
    sm: "bottom-0.5 text-xl",
    xs: "bottom-0 text-[11px]",
  }[size]

  return (
    <div className={cn("relative", box, className)}>
      <svg viewBox="0 0 140 78" className="absolute inset-0 h-full w-full">
        <path
          d={ARC}
          fill="none"
          stroke="#E2E8F0"
          strokeWidth={weight}
          strokeLinecap="round"
        />
        <path
          d={ARC}
          fill="none"
          stroke="currentColor"
          strokeWidth={weight}
          strokeLinecap="round"
          strokeDasharray={LENGTH}
          strokeDashoffset={LENGTH * (1 - shown / 100)}
          style={{ transition: "stroke-dashoffset 700ms ease-out" }}
        />
      </svg>
      {withLabel && (
        <p
          className={cn(
            "absolute inset-x-0 text-center font-extrabold leading-none tracking-tight",
            label,
          )}
        >
          {Math.round(percent)}%
        </p>
      )}
    </div>
  )
}

/* Findings from one section under one heading.

   The section name was repeating on every row - eight consecutive rows reading
   CHAIRMAN'S STATEMENT, which is noise standing where the eye looks for what
   changed. Consecutive only: the rows arrive in document order and grouping
   across the whole list would reorder the report. */
function byWhere(items: FindingItem[]): { where: string; items: FindingItem[] }[] {
  const blocks: { where: string; items: FindingItem[] }[] = []
  for (const item of items) {
    const last = blocks[blocks.length - 1]
    if (last && last.where === item.where) {
      last.items.push(item)
    } else {
      blocks.push({ where: item.where, items: [item] })
    }
  }
  return blocks
}

/* Section bodies are markdown, so a sentence pulled out of one arrives with its
   emphasis markers attached - "**$85.5 billion**" on screen. Only the markers
   are dropped; the words are never touched, because this text is quoted back to
   the PM as what the report actually says. */
function plain(text: string): string {
  return text.replace(/\*\*/g, "").replace(/__/g, "")
}

/* One number across the checks, and the parts it came from.

   A plain average would be wrong twice over. The percentages are measured over
   bases that differ by two orders of magnitude - 384 figure mentions against 3
   sections - so an unweighted mean lets the smallest base move the headline as
   much as the largest. And it blends the one figure that is COUNTED with three
   that are the model's opinion.

   So: weights, stated on the card, with figure tracing carrying half of it. An
   unsourced number in a board report matters more than an unused slogan, and it
   is the only part of this that is not a judgement.

   A metric that does not apply is dropped and the rest renormalise - which is
   why the card says how many checks fed it. Without that, a company with no
   house style and no primary message would quietly score higher than one that
   configured both, by having fewer ways to fail.

   Never printed in the report. The Validation Statement carries the counted
   ratio; a blended opinion is not something to hand a board. */
function Overall({ validation }: { validation: ReportValidation }) {
  const total = validation.figures_total || 0
  const coverage = validation.coverage
  const briefTotal = validation.brief_asks_total ?? 0

  // Primary when the report has one, since a primary message leading is the
  // promise being checked; otherwise how far the secondaries reach.
  const concept =
    coverage?.primary?.percent ??
    (coverage && coverage.secondary.length > 0
      ? coverage.secondary_any.percent
      : null)

  const parts = [
    {
      key: "figures",
      label: "Figures traced to a source",
      percent: total
        ? Math.round(((validation.figures_traced || 0) / total) * 100)
        : null,
      weight: 50,
      counted: true,
    },
    {
      key: "brief",
      label: "Strategic brief covered",
      percent: briefTotal
        ? Math.round(((briefTotal - validation.brief_gaps.length) / briefTotal) * 100)
        : null,
      weight: 20,
      counted: false,
    },
    {
      key: "concept",
      label: coverage?.primary
        ? "Primary concept message carried"
        : "Concept messages carried",
      percent: concept,
      weight: 20,
      counted: false,
    },
    {
      key: "tone",
      label: "Company tone followed",
      percent: coverage?.tone?.percent ?? null,
      weight: 10,
      counted: false,
    },
  ].filter((p): p is typeof p & { percent: number } => p.percent != null)

  if (parts.length === 0) return null

  const weight = parts.reduce((sum, p) => sum + p.weight, 0)
  const overall = Math.round(
    parts.reduce((sum, p) => sum + p.percent * p.weight, 0) / weight,
  )

  const tone =
    overall >= 75
      ? { text: "text-emerald-700", ring: "border-emerald-200" }
      : overall >= 50
        ? { text: "text-amber-700", ring: "border-amber-200" }
        : { text: "text-rose-700", ring: "border-rose-200" }

  return (
    <div className={cn("rounded-2xl border bg-white px-6 py-5 shadow-sm", tone.ring)}>
      <div className="flex items-center gap-6">
        <Gauge percent={overall} className={cn("shrink-0", tone.text)} size="lg" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#1A1D2E]">Overall</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            Weighted across the {parts.length} check
            {parts.length === 1 ? " that applies" : "s that apply"} to this report.
            Not printed in the report itself.
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3">
        {/* The column read as a bare "x50%" with nothing above it, and the
            first person to see it had to ask what it meant. */}
        <div className="flex items-baseline gap-3 text-[10px] font-bold uppercase tracking-wide text-slate-300">
          <span className="w-10 shrink-0 text-right">Score</span>
          <span className="min-w-0 flex-1">Check</span>
          <span className="shrink-0">Weight</span>
        </div>

        <ul className="mt-1.5 space-y-1.5">
          {parts.map((part) => (
            <li key={part.key} className="flex items-baseline gap-3 text-xs">
              <span className="w-10 shrink-0 text-right font-bold tabular-nums text-[#1A1D2E]">
                {part.percent}%
              </span>
              <span className="min-w-0 flex-1 text-slate-500">
                {part.label}
                {part.counted && (
                  <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                    counted, not judged
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-slate-400">
                {Math.round((part.weight / weight) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* What the strategic brief actually asked for, one line each.

   Folded, because seven lines under a card that already says 100% is a lot of
   card for a reader who only wanted the number. Open, it is the answer to
   "seven of what?" - which the card could not give at all while only the
   failures were named. */
function BriefAsks({
  asks,
  titleOf,
}: {
  asks: NonNullable<ReportValidation["brief_asks"]>
  /** A section code to the name a person would recognise. */
  titleOf: (code: string) => string
}) {
  const [open, setOpen] = useState(false)
  if (asks.length === 0) return null

  const covered = asks.filter((a) => a.covered === true).length

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 text-left"
      >
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform",
            !open && "-rotate-90",
          )}
        />
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
          What the brief asked for
        </span>
        {!open && (
          <span className="text-[11px] text-slate-300">
            {covered} covered, {asks.length - covered} not
          </span>
        )}
      </button>

      {open && (
        <ul className="mt-2 space-y-1.5 pl-5">
          {asks.map((a, i) => (
            <li key={`${a.ask}-${i}`} className="flex items-baseline gap-2 text-xs">
              <span
                className={cn(
                  "shrink-0 font-bold",
                  a.covered === true ? "text-emerald-600" : "text-rose-500",
                )}
              >
                {a.covered === true ? "\u2713" : "\u2717"}
              </span>
              <span className="min-w-0 flex-1 leading-relaxed text-slate-600">
                {a.ask}
              </span>
              <span className="shrink-0 text-right text-slate-400">
                {a.covered === true
                  ? a.where
                    ? titleOf(a.where)
                    : "covered"
                  : "not covered"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* How much of the strategic brief the report answers.

   Its own component, not a card inside Coverage. Coverage returns null when
   pass 1 read no sections, and the brief card was going with it - two different
   judgements, from two different passes, where one failing took down the other
   even though the brief data was sitting right there.

   Pass 1 reads the sections and produces concept and tone coverage. Pass 2
   reads the brief. Nothing about the brief depends on how the sections were
   read, so nothing about it should disappear when that read fails. */
function BriefCoverage({ validation }: { validation: ReportValidation }) {
  const total = validation.brief_asks_total ?? 0
  const gaps = validation.brief_gaps.length
  const asks = validation.brief_asks ?? []

  // Nothing was judged about the brief at all - no count, no asks, no gaps.
  // A card saying "coverage cannot be worked out" is worth showing when the
  // judgement ran and came back thin; it is noise when it never ran.
  if (!total && asks.length === 0 && gaps === 0) return null

  return (
    <div className="space-y-2">
      <Stat
        label="Strategic brief"
        stat={
          total
            ? {
                sections: total - gaps,
                percent: Math.round(((total - gaps) / total) * 100),
              }
            : null
        }
        /* The judgement returns the gaps and the count together. Without a
           count there is no share to show - the gaps still appear as findings
           below, they just cannot be put over a base. */
        empty="No count of the brief's asks was recorded, so coverage cannot be worked out."
        reason={
          total
            ? `${total - gaps} of the ${total} explicit asks in the strategic brief ${total - gaps === 1 ? "is" : "are"} covered by a section.`
            : ""
        }
        /* The gaps are listed in full by the block below, which names the
           covered asks too. Repeating them here said the same thing twice. */
        evidence={
          gaps && (validation.brief_asks ?? []).length === 0
            ? [
                {
                  label: "Not covered",
                  sections: validation.brief_gaps.map((g) => g.ask),
                  unit: "ask",
                },
              ]
            : []
        }
        excluded={[]}
        footer={
          <BriefAsks
            asks={validation.brief_asks ?? []}
            // The judgement answers in section codes - they are the only names
            // it is shown. The reader gets the title.
            titleOf={(code) =>
              validation.sections?.[code]?.title || prettifyCode(code)
            }
          />
        }
      />
    </div>
  )
}

/* A markdown table row, pulled apart.

   The findings list quotes the line a figure sits in. For prose that is a
   sentence; for a table it was the raw row, pipes and all - and the row's
   figures were already sitting in chips directly above it, so the same numbers
   appeared twice in two formats.

   Returns null for anything that is not a table row, which is most lines. */
function tableRow(detail: string): { label: string } | null {
  const line = detail.trim()
  if (!line.startsWith("|")) return null

  const cells = line
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c !== "")
  if (cells.length < 2) return null

  // A row whose first cell is itself a number has no label to pull out - a
  // year header, typically. Bolding a number there would read as a heading.
  const first = cells[0]
  return { label: /[A-Za-z\u0600-\u06FF]/.test(first) ? first : "" }
}

/* The figure as the report writes it, recovered from the line it came from.

   Findings carry the normalised form - "1245600" - because that is what
   matching compares. It is also what nobody wants to read. The original is
   still in the context line, so it is found there rather than stored twice. */
function asWritten(value: string, context: string): string {
  const written = context.match(/[\d][\d,.\u066B\u066C]*/g) || []
  for (const candidate of written) {
    const digits = candidate.replace(/[^\d.]/g, "").replace(/\.$/, "")
    if (digits === value) return candidate.replace(/\.$/, "")
  }
  return value
}

interface FindingItem {
  where: string
  /** Short values shown as chips, when the finding is about particular ones. */
  lead: string[]
  detail: string
}

/* One row per sentence, carrying every untraced figure in it.
   A sentence like "...2,380 employees, 100 sites, 68 programmes" produced three
   rows quoting the same sentence three times. The PM reads it once. */
function bySentence(
  untraced: ReportValidation["untraced"],
): FindingItem[] {
  const rows = new Map<string, FindingItem>()
  for (const u of untraced) {
    const where = u.title || u.section_code
    const detail = u.context ?? ""
    const key = `${where}||${detail}`
    const row = rows.get(key)
    if (row) {
      row.lead.push(u.value)
    } else {
      rows.set(key, { where, lead: [u.value], detail })
    }
  }
  return [...rows.values()]
}

interface FindingGroup {
  key: string
  title: string
  why: string
  items: FindingItem[]
  /** What the badge counts, when that is not the number of rows. The untraced
   *  group packs several figures into one sentence, so 94 figures show as 73
   *  rows and the badge must say 94. */
  count?: number
  /** Share of a real denominator, or null when the group has none. Several
   *  genuinely do not: nothing counts how many measures or how many asks a
   *  report contains, and a percentage over an invented base says less than no
   *  percentage at all. */
  percent?: number | null
  /** How the count and the percentage were arrived at, in one sentence. A
   *  number the reader cannot reconstruct is a number they have to trust. */
  reason?: string
}

/* Collapsed by default past a handful. One group ran to 364 rows on a real
   report, which buried the other five groups entirely — the PM could not see
   there was anything else wrong. */
function Group({ group }: { group: FindingGroup }) {
  const total = group.count ?? group.items.length
  const blocks = byWhere(group.items)

  // A short card opens whole; a long one opens its first section and folds the
  // rest. 80 findings expanded is a page of scrolling before the next card, and
  // a folded section still shows its name and its count, so nothing is hidden -
  // only the sentences are, and they are what takes the room.
  const [openSections, setOpenSections] = useState<Set<string>>(
    () =>
      new Set(
        group.items.length <= SHOWN
          ? blocks.map((b) => b.where)
          : blocks.slice(0, 1).map((b) => b.where),
      ),
  )

  const toggle = (where: string) =>
    setOpenSections((current) => {
      const next = new Set(current)
      if (next.has(where)) {
        next.delete(where)
      } else {
        next.add(where)
      }
      return next
    })

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-start gap-3 border-b border-slate-100 bg-amber-50/40 px-5 py-3.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#1A1D2E]">
            {group.title}
            {total > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                {total.toLocaleString()}
              </span>
            )}
          </p>
          {group.why && <p className="mt-0.5 text-xs text-slate-500">{group.why}</p>}
          {group.reason && (
            <p className="mt-1 text-xs text-slate-400">{group.reason}</p>
          )}
        </div>

        {/* Always amber, never graded green-to-red like the gauges above. A
            high number here is a bad thing, so the usual scale would paint the
            worst card green. The card's own colour already says "look at
            this"; the arc only says how much. */}
        {group.percent != null && (
          <div className="flex shrink-0 items-center gap-2">
            <Gauge
              percent={group.percent}
              size="xs"
              withLabel={false}
              className="text-amber-600"
            />
            <span className="text-base font-extrabold tabular-nums text-amber-700">
              {group.percent}%
            </span>
          </div>
        )}
      </div>

      {/* Capped and scrolled rather than allowed to run: one card held 80
          findings and pushed every other card off the screen. */}
      <ul className="max-h-[26rem] divide-y divide-slate-100 overflow-y-auto">
        {blocks.map((block) => (
          <li key={block.where} className="px-5 py-3">
            <button
              onClick={() => toggle(block.where)}
              className="flex w-full items-center gap-1.5 text-left"
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform",
                  !openSections.has(block.where) && "-rotate-90",
                )}
              />
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                {block.where}
              </span>
              <span className="text-[11px] font-semibold text-slate-300">
                {block.items.length}
              </span>
            </button>

            <div
              className={cn(
                "mt-1.5 space-y-2.5 pl-5",
                !openSections.has(block.where) && "hidden",
              )}
            >
              {block.items.map((item, i) => {
                const table = tableRow(item.detail)

                // A table row says itself in one line: what the row is, then
                // the figures being flagged in it. The raw row is not quoted -
                // it holds no words the chips do not already carry.
                if (table) {
                  return (
                    <div key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      {table.label && (
                        <span className="text-sm font-semibold text-[#1A1D2E]">
                          {table.label}
                        </span>
                      )}
                      {item.lead.map((value) => (
                        <span
                          key={value}
                          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-700"
                        >
                          {asWritten(value, item.detail)}
                        </span>
                      ))}
                    </div>
                  )
                }

                return (
                  <div key={i}>
                    {item.lead.length > 0 && (
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        {item.lead.map((value) => (
                          <span
                            key={value}
                            className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-700"
                          >
                            {asWritten(value, item.detail)}
                          </span>
                        ))}
                      </div>
                    )}
                    {item.detail && (
                      <p className="mt-1 text-sm leading-relaxed text-slate-600">
                        {plain(item.detail)}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
