"use client"

import { useMemo } from "react"
import { ProsePreview } from "@/components/ui/prose-preview"
import { ReportSectionRenderer } from "@/components/report/ReportSectionRenderer"
import { COMPANY_PROFILES, SECTORS } from "@/lib/constants"
import { computeSectionNumbering, toArabicDigits } from "@/lib/report-format"
import type {
  CompanyProfile,
  ContentLanguage,
  FinalReport,
  Sector,
} from "@/types"

interface CycleMeta {
  cycle_name?: string
  fiscal_year?: number
  company_profile?: CompanyProfile | null
  sector?: Sector | null
  content_language?: ContentLanguage
}

interface FinalReportViewProps {
  report: FinalReport
  cycle: CycleMeta | undefined
}

export function FinalReportView({ report, cycle }: FinalReportViewProps) {
  // Skip the auto cover/TOC sections from the body list — we render bespoke
  // treatments for those.
  const bodySections = report.sections
    .filter((s) => s.type !== "auto")
    .sort((a, b) => a.order - b.order)

  // Same flag the backend uses to right-align Arabic headings & numbers.
  const isArabic = cycle?.content_language === "arabic"

  // Resolve every section's canonical number (and its sub-heading numbers) from
  // the backend outline, so the preview matches the DOCX/PDF exactly. Falls back
  // to each section's flat `number` when no outline is present.
  const numbering = useMemo(
    () => computeSectionNumbering(bodySections, report.outline),
    [bodySections, report.outline],
  )
  // The Executive Summary is #1 in the canonical scheme but lives outside
  // `sections`, so pull its number from the head of the outline.
  const execNumber = report.outline?.[0]?.number ?? null

  return (
    <article className="mx-auto max-w-3xl px-6 py-10 space-y-12 print:max-w-none print:px-0 print:py-0 print:space-y-0">
      <CoverBlock report={report} cycle={cycle} />
      <ExecutiveSummary
        content={report.executive_summary}
        number={execNumber}
        isArabic={isArabic}
      />
      {bodySections.map((section, i) => {
        const n = numbering.get(section.section_code)
        return (
          <ReportSectionRenderer
            key={section.section_code}
            section={section}
            index={i}
            number={n?.number ?? null}
            subNumbers={n?.subNumbers ?? []}
            isArabic={isArabic}
          />
        )
      })}
      {bodySections.some((s) => s.type === "attachment") && (
        <p className="hidden print:block text-xs text-muted-foreground border-t pt-4">
          Audited financial documents are provided as separate files.
        </p>
      )}
    </article>
  )
}

function CoverBlock({
  report,
  cycle,
}: {
  report: FinalReport
  cycle: CycleMeta | undefined
}) {
  const profileLabel = cycle?.company_profile
    ? COMPANY_PROFILES[cycle.company_profile]
    : null
  const sectorLabel = cycle?.sector ? SECTORS[cycle.sector] : null
  const metaLine = [sectorLabel, profileLabel].filter(Boolean).join(" · ")

  return (
    <section className="flex flex-col items-center justify-center text-center min-h-[60vh] gap-6 print:min-h-[90vh] print:break-after-page">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
        Annual Report
      </p>
      <div className="space-y-3">
        <h1 className="text-5xl font-semibold tracking-tight leading-tight">
          {cycle?.fiscal_year ? `${cycle.fiscal_year}` : ""}
        </h1>
        {cycle?.cycle_name && (
          <p className="text-2xl text-muted-foreground font-medium">
            {cycle.cycle_name}
          </p>
        )}
      </div>
      {report.headline && (
        <p className="max-w-xl text-lg leading-relaxed italic text-foreground/80">
          {report.headline}
        </p>
      )}
      {metaLine && (
        <p className="text-xs uppercase tracking-wider text-muted-foreground mt-8">
          {metaLine}
        </p>
      )}
    </section>
  )
}

function ExecutiveSummary({
  content,
  number,
  isArabic,
}: {
  content: string | null
  // Canonical number ("1"); null only if the outline is absent.
  number: string | null
  isArabic: boolean
}) {
  if (!content || !content.trim()) return null
  return (
    <section className="print:break-before-page">
      <h2
        dir={isArabic ? "rtl" : "ltr"}
        className="text-2xl font-semibold mb-4 flex items-baseline gap-3"
      >
        {number != null && (
          <span className="text-muted-foreground tabular-nums text-base font-normal">
            {isArabic ? toArabicDigits(number) : number}
          </span>
        )}
        <span>Executive Summary</span>
      </h2>
      <ProsePreview content={content} dir={isArabic ? "rtl" : "ltr"} />
    </section>
  )
}
