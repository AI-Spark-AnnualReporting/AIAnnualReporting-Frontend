"use client"

import { useMemo } from "react"
import { ProsePreview } from "@/components/ui/prose-preview"
import { CoverPreview } from "@/components/report/design/CoverPreview"
import {
  BODY_INK,
  H4_MARGIN_INSET,
  SUBHEADING_MARGINS,
} from "@/components/report/design/PagePreview"
import { PAGE_H, PAGE_W } from "@/components/report/design/PreviewFrame"
import { ReportSectionRenderer } from "@/components/report/ReportSectionRenderer"
import { COMPANY_PROFILES, SECTORS } from "@/lib/constants"
import { computeSectionNumbering, toArabicDigits } from "@/lib/report-format"
import type { AssembledReport } from "@/lib/api/annual-design"
import {
  DEFAULT_LAYOUT_KEY,
  LAYOUT_TYPOGRAPHY,
  subheadingStyle,
} from "@/types/report-design"
import type { BrandColors, Typography } from "@/types/report-design"
import type {
  CompanyProfile,
  ContentLanguage,
  FinalReport,
  Sector,
} from "@/types"

// A4 at 96dpi is 794 x 1123 CSS px. The sheet used to be max-w-3xl — 768px
// wide with 48px padding, so a 672px text column standing in for a 794px page.
// Every measurement a reader takes off it (line length, how much fits above the
// fold, how a wide table sits) was therefore wrong by 15%.
//
// The renderer measures in points; this sheet is that page at 96dpi, so one of
// its points is this many CSS px here. Every number taken off the document —
// the width, the margin, a type size — comes through this one conversion.
const PX_PER_PT = 96 / 72
const SHEET_W = PAGE_W * PX_PER_PT          // 793.3
// The renderer's 50pt page margin, in the same units.
const SHEET_PAD = 50 * PX_PER_PT            // 66.7

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
  /**
   * The document as the export engine will print it. When present the cover,
   * the brand colour and the type all come from it, so what is on screen is
   * what will be in the file. Absent (the engine unreachable, or the report not
   * yet assembled) the page falls back to its own plain treatment rather than
   * showing nothing.
   */
  assembled?: AssembledReport
  /**
   * True while the assembled document is still on its way. The cover is drawn
   * from it, so painting the fallback in the meantime shows the reader a
   * different front page for a second and then swaps it — which is exactly the
   * "it went white, then ten seconds later it turned yellow" this page did.
   */
  assembledPending?: boolean
}

export function FinalReportView({
  report, cycle, assembled, assembledPending = false,
}: FinalReportViewProps) {
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

  const brand = (assembled?.cover?.brand ?? assembled?.brand ?? {}) as BrandColors
  const layoutKey = assembled?.cover?.template_key ?? DEFAULT_LAYOUT_KEY
  const typography = (assembled?.typography as Typography | null)
    ?? LAYOUT_TYPOGRAPHY[layoutKey]
    ?? LAYOUT_TYPOGRAPHY[DEFAULT_LAYOUT_KEY]

  // The subheading options, with the defaults filled in for a design stored
  // before they existed. `numbering` is not a CSS property — it decides whether
  // the outline's "4.1" is prefixed to the markdown at all, further down.
  const sub = subheadingStyle(typography.subheading)
  const [subAbove, subBelow] = SUBHEADING_MARGINS[sub.spacing]
  const pt = (v: number) => `${(v * PX_PER_PT).toFixed(2)}px`

  // Handed to the sheet as custom properties rather than applied per element:
  // the body prose is rendered from markdown by ProsePreview, which has no
  // per-report styling hook, and inheritance reaches every heading and
  // paragraph inside it without either component knowing about the other.
  const sheetVars = {
    "--report-brand": brand.primary || "#3C0866",
    "--report-font-heading": typography.heading.family,
    "--report-font-body": typography.body.family,
    // The subheading role, which this sheet used to have no opinion about at
    // all — see the note on the h3/h4 rules below.
    "--report-font-sub": typography.subheading.family,
    "--report-sub-size": pt(typography.subheading.size),
    "--report-sub-size-h4": pt(typography.subheading.size - 1),
    "--report-sub-weight": String(typography.subheading.weight),
    "--report-sub-color": sub.color === "brand"
      ? (brand.primary || "#3C0866")
      : BODY_INK,
    "--report-sub-case": sub.case === "upper" ? "uppercase" : "none",
    "--report-sub-above": pt(subAbove),
    "--report-sub-below": pt(subBelow),
    "--report-sub-above-h4": pt(subAbove - H4_MARGIN_INSET[0]),
    "--report-sub-below-h4": pt(subBelow - H4_MARGIN_INSET[1]),
  } as React.CSSProperties

  return (
    // A sheet of paper on the canvas behind it, rather than bare text on the
    // page background: this is a finished document, and it should look like one
    // before it is downloaded. The proportions and the soft shadow match the
    // report previews elsewhere in the platform, so the same document looks the
    // same wherever it is shown.
    //
    // One continuous sheet, not paginated — where a page actually breaks is
    // decided by the renderer at export time, and drawing invented breaks here
    // would promise a layout the file will not have.
    <article
      style={{ ...sheetVars, width: SHEET_W, paddingInline: SHEET_PAD }}
      className="report-sheet mx-auto my-8 max-w-full space-y-12 overflow-hidden
                 rounded-lg border border-[#E5E7EF] bg-white pb-14
                 shadow-[0_10px_30px_rgba(20,22,40,.08)]
                 print:my-0 print:w-auto print:rounded-none print:border-0
                 print:px-0 print:py-0 print:shadow-none print:space-y-0">
      {/* Section titles and their numbers carry the report's own brand colour,
          and its heading font, so the design is visible in the body and not
          only on the front page. Scoped to this sheet — the surrounding app
          keeps its own type.

          h3/h4 are the subheadings *inside* a section, and the document draws
          them from the subheading role. This sheet used to hand them the
          heading family and nothing else — no size, no weight, and none of the
          four options below — so a subheading on screen and the same one in the
          file were two different things. The rules below close that: the same
          role, converted from the renderer's points at the same 96dpi the
          sheet's own width uses.

          Sizes and margins land on h3/h4 as absolute lengths rather than the
          `prose` scale, which is why they beat @tailwindcss/typography's own
          `:where()` rules on specificity without an !important. */}
      <style>{`
        .report-sheet h1, .report-sheet h2 {
          font-family: var(--report-font-heading), ui-sans-serif, system-ui, sans-serif;
        }
        .report-sheet h2 { color: var(--report-brand); }
        .report-sheet h3, .report-sheet h4 {
          font-family: var(--report-font-sub), ui-sans-serif, system-ui, sans-serif;
          font-weight: var(--report-sub-weight);
          color: var(--report-sub-color);
          text-transform: var(--report-sub-case);
        }
        .report-sheet h3 {
          font-size: var(--report-sub-size);
          margin: var(--report-sub-above) 0 var(--report-sub-below);
        }
        .report-sheet h4 {
          font-size: var(--report-sub-size-h4);
          margin: var(--report-sub-above-h4) 0 var(--report-sub-below-h4);
        }
        .report-sheet .prose p, .report-sheet .prose li, .report-sheet .prose td {
          font-family: var(--report-font-body), ui-sans-serif, system-ui, sans-serif;
        }
        .report-sheet .prose th {
          color: var(--report-brand);
          border-bottom: 3px solid var(--report-brand);
        }
      `}</style>

      <CoverBlock report={report} cycle={cycle} assembled={assembled}
                  pending={assembledPending} />
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
            // `plain` drops the "4.1" the outline numbers subheadings with.
            // An empty list is how that is said here: the prefixer this feeds
            // walks numbers onto headings and stops when it runs out, so none
            // means none — the same thing the PDF does with the option set.
            subNumbers={sub.numbering === "plain" ? [] : (n?.subNumbers ?? [])}
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
  assembled,
  pending,
}: {
  report: FinalReport
  cycle: CycleMeta | undefined
  assembled?: AssembledReport
  pending?: boolean
}) {
  // Hold the space rather than filling it with a cover we already know is not
  // the right one. A blank sheet that becomes the real cover reads as loading;
  // a generic cover that becomes a branded one reads as the design failing.
  if (pending && !assembled?.cover) {
    const scale = SHEET_W / PAGE_W
    return (
      <section aria-busy="true"
               style={{ height: PAGE_H * scale, width: SHEET_W,
                        marginInline: -SHEET_PAD, overflow: "hidden" }}
               className="animate-pulse bg-muted/40" />
    )
  }

  // The real cover, drawn by the same component the design dialog previews and
  // from the same payload the file is printed from. Apply a navy Bold cover and
  // this page changes — it used to draw its own generic front page, so the PM
  // who chose the design saw the plain one while an external reviewer looking at
  // the same report saw the designed one.
  const cover = assembled?.cover
  if (cover) {
    const isArabic = assembled?.content_language === "arabic"
    const values = cover.values ?? {}
    const layoutKey = cover.template_key ?? DEFAULT_LAYOUT_KEY
    const typography = (assembled?.typography as Typography | null)
      ?? LAYOUT_TYPOGRAPHY[layoutKey]
      ?? LAYOUT_TYPOGRAPHY[DEFAULT_LAYOUT_KEY]
    // Full sheet width, breaking out of the page margin the body copy sits in:
    // a cover is printed to the paper edge, and an inset one reads as a picture
    // of a cover rather than the cover. The sheet is A4-wide, so this is 1:1 —
    // a type size on screen is the type size in the file.
    const scale = SHEET_W / PAGE_W
    return (
      <section className="print:break-after-page"
               style={{ height: PAGE_H * scale, width: SHEET_W,
                        marginInline: -SHEET_PAD, overflow: "hidden" }}>
        <div style={{ width: PAGE_W, height: PAGE_H,
                      transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <CoverPreview
            templateKey={layoutKey}
            brand={(cover.brand ?? assembled?.brand ?? {}) as BrandColors}
            typography={typography}
            companyName={values.company_name}
            title={values.title}
            headline={values.headline}
            periodLabel={values.period_label}
            preparedOn={values.prepared_on}
            footnote={values.footnote}
            logoUrl={values.logo_url}
            coverImage={values.cover_image}
            isArabic={isArabic}
          />
        </div>
      </section>
    )
  }

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
        {/* Must stay identical to EXEC_SUMMARY_LABEL_AR in the backend's
            markdown_text.py — the PDF/DOCX and the TOC use that wording, and a
            different one here makes the preview disagree with the document. */}
        <span>{isArabic ? "الملخص التنفيذي" : "Executive Summary"}</span>
      </h2>
      <ProsePreview content={content} dir={isArabic ? "rtl" : "ltr"} />
    </section>
  )
}
