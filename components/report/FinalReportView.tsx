"use client"

import { ProsePreview } from "@/components/ui/prose-preview"
import { ReportSectionRenderer } from "@/components/report/ReportSectionRenderer"
import { COMPANY_PROFILES, SECTORS } from "@/lib/constants"
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

  return (
    <article className="mx-auto max-w-3xl px-6 py-10 space-y-12 print:max-w-none print:px-0 print:py-0 print:space-y-0">
      <CoverBlock report={report} cycle={cycle} />
      <ExecutiveSummary content={report.executive_summary} isArabic={isArabic} />
      {bodySections.map((section, i) => (
        <ReportSectionRenderer
          key={section.section_code}
          section={section}
          index={i}
          isArabic={isArabic}
        />
      ))}
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
  isArabic,
}: {
  content: string | null
  isArabic: boolean
}) {
  if (!content || !content.trim()) return null
  return (
    <section className="print:break-before-page">
      <h2
        dir={isArabic ? "rtl" : "ltr"}
        className="text-2xl font-semibold mb-4"
      >
        Executive Summary
      </h2>
      <ProsePreview content={content} dir={isArabic ? "rtl" : "ltr"} />
    </section>
  )
}
