"use client"

import { ProsePreview } from "@/components/ui/prose-preview"
import { ReportSectionRenderer } from "@/components/report/ReportSectionRenderer"
import { COMPANY_PROFILES, SECTORS } from "@/lib/constants"
import type {
  CompanyProfile,
  FinalReport,
  Sector,
} from "@/types"

interface CycleMeta {
  cycle_name?: string
  fiscal_year?: number
  company_profile?: CompanyProfile | null
  sector?: Sector | null
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

  return (
    <article className="mx-auto max-w-3xl px-6 py-10 space-y-12 print:max-w-none print:px-0 print:py-0 print:space-y-0">
      <CoverBlock report={report} cycle={cycle} />
      <TableOfContents sections={bodySections} />
      <ExecutiveSummary content={report.executive_summary} />
      {bodySections.map((section, i) => (
        <ReportSectionRenderer
          key={section.section_code}
          section={section}
          index={i}
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

function TableOfContents({ sections }: { sections: FinalReport["sections"] }) {
  if (sections.length === 0) return null
  return (
    <nav className="print:break-before-page">
      <h2 className="text-2xl font-semibold mb-6">Contents</h2>
      <ol className="space-y-2.5 border-t pt-4">
        {sections.map((s, i) => (
          <li
            key={s.section_code}
            className="flex items-baseline gap-3 border-b border-dotted border-muted pb-2"
          >
            <span className="text-muted-foreground tabular-nums text-sm">
              {String(i + 1).padStart(2, "0")}
            </span>
            <a
              href={`#${s.section_code}`}
              className="flex-1 hover:underline print:no-underline"
            >
              {s.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

function ExecutiveSummary({ content }: { content: string | null }) {
  if (!content || !content.trim()) return null
  return (
    <section className="print:break-before-page">
      <h2 className="text-2xl font-semibold mb-4">Executive Summary</h2>
      <ProsePreview content={content} />
    </section>
  )
}
