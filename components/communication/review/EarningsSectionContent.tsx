"use client"

import type { CSSProperties } from "react"
import { CoverRenderer } from "./CoverRenderer"

/**
 * Earnings section content, ported from the Centrion frontend's earnings
 * preview (components/earnings/SectionRenderer.tsx and the components +
 * preview-helpers it dispatches to) so the reviewer sees the same document the
 * creator approved.
 *
 * The rule this replaces the old MetricTable for, quoting SectionTable.tsx:
 * "No Prior/Change columns are ever rendered: earnings data has no
 * comparatives, and we never show a fabricated or blank delta column (D-12)."
 * A blank must read as what it is — a gap shows its reason, a still-producing
 * row shows "Pending" — never the same grey dash for both.
 */

const INK = "#1A1D2E"
const MUTED = "#5A6080"
const FAINT = "#9BA3C4"
const BORDER = "#E2E4F0"
const BRAND = "var(--brand-primary, #4040C8)"
const MONO = "var(--font-dm-mono), 'DM Mono', 'Courier New', monospace"
// ConfidenceBadge's established amber — within-feature consistency.
const GAP_AMBER = { color: "#B45309", bg: "rgba(245,158,11,.12)" }

type Section = { section_code: string; mode: string; content: string | null }

// ─── content-shape dispatch ───────────────────────────────────────────────────
function isCoverMode(s: Section): boolean {
  return s.mode === "cover" || /cover/i.test(s.section_code)
}
// Trend (S16) reuses the table path entirely — no dedicated component.
function isTableMode(s: Section): boolean {
  return s.mode === "table" || s.mode === "kpi" || s.mode === "trend"
}
// Management commentary (S05) — a quote block: verbatim text + attribution.
function isQuoteMode(s: Section): boolean {
  return s.mode === "quote" || /commentary/i.test(s.section_code)
}
// Non-IFRS reconciliation (S15) — reported → adjustments → adjusted, per line.
function isReconciliationMode(s: Section): boolean {
  return s.mode === "reconciliation" || /reconciliation/i.test(s.section_code)
}
// Sources, Methodology & Assumptions (S18) — one citation per figure.
function isSourcesMode(s: Section): boolean {
  return /sources|methodology/i.test(s.section_code)
}

// Dispatch a produced section by content shape: cover → CoverRenderer,
// table/kpi → SectionTable (label + value only), else prose.
export function EarningsSectionContent({
  section,
  coverTemplateKey,
}: {
  section: Section
  coverTemplateKey?: string | null
}) {
  // Some endpoints return content already parsed; normalise so .trim() works.
  const raw = section.content as unknown
  const content = raw == null ? null : typeof raw === "string" ? raw : JSON.stringify(raw)

  if (isCoverMode(section)) {
    const cv = readCoverValues(content, coverTemplateKey ?? null)
    return (
      <CoverRenderer
        companyName={cv.companyName}
        period={cv.period}
        title={cv.title}
        preparedOn={cv.preparedOn}
        templateKey={cv.templateKey}
        maxWidth={820}
      />
    )
  }

  // QuoteBlock returns null when the backend omitted it (no placeholder, ever),
  // so there's no empty-content branch here.
  if (isQuoteMode(section)) return <QuoteBlock content={content} />

  if (isReconciliationMode(section)) {
    if (content == null || content.trim() === "") return <Blank />
    return <ReconciliationTable content={content} />
  }

  if (isSourcesMode(section)) {
    if (content == null || content.trim() === "") return <Blank />
    return <SourcesList content={content} />
  }

  if (content == null || content.trim() === "") return <Blank />

  if (isTableMode(section)) {
    // Table mode but non-JSON content → treat the string as prose.
    if (tryParseJson(content) === undefined) return <Prose text={content} />
    return <SectionTable content={content} />
  }

  // Fallback: some sections (Reporting Calendar / IR Contact) carry a structured
  // JSON envelope even though their mode isn't a known tabular one. Render that
  // as a label/value table rather than dumping raw JSON. Plain prose never
  // JSON-parses to an object/array, so it still falls through to <Prose>.
  const parsed = tryParseJson(content)
  if (parsed !== undefined && (Array.isArray(parsed) || isRecord(parsed))) {
    return <SectionTable content={content} />
  }

  return <Prose text={content} />
}

function Blank() {
  return <p style={{ margin: 0, fontSize: 13, color: MUTED }}>No data available for this section.</p>
}

// ─── prose ────────────────────────────────────────────────────────────────────
function Prose({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const blocks = paragraphs.length ? paragraphs : [text]
  return (
    <>
      {blocks.map((p, i) => (
        <p
          key={i}
          style={{ margin: i === 0 ? 0 : "14px 0 0", fontSize: 14, lineHeight: 1.75, color: "#2A2E47", whiteSpace: "pre-wrap", textAlign: "justify" }}
        >
          {p}
        </p>
      ))}
    </>
  )
}

// ─── tables ───────────────────────────────────────────────────────────────────
const TH: CSSProperties = {
  padding: "8px 10px",
  color: BRAND,
  fontWeight: 700,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
}
const VALUE_CELL: CSSProperties = {
  padding: "9px 10px",
  textAlign: "right",
  fontFamily: MONO,
  color: BRAND,
  fontWeight: 700,
}

function GapChip({ text }: { text: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 9px",
        borderRadius: 20,
        fontSize: 10,
        fontWeight: 700,
        color: GAP_AMBER.color,
        background: GAP_AMBER.bg,
      }}
    >
      {text}
    </span>
  )
}

// Renders an earnings table/kpi envelope as Metric | Value — `label` +
// `current_display` ONLY. An out-of-catalog row shows its gap reason instead of
// a value, and a still-producing row shows "Pending" — never the same grey dash.
function SectionTable({ content }: { content: string | null }) {
  const parsed = content ? tryParseJson(content) : undefined
  if (parsed === undefined) return null
  const tables = normalizeTables(parsed)
    .map((t) => ({ ...t, rows: t.rows.filter((r) => rowBlankState(r) !== "omitted") }))
    .filter((t) => t.rows.length > 0)
  if (tables.length === 0) return <Blank />
  // A Source column only appears when at least one row carries a citation.
  const showSource = tables.some((t) => t.rows.some((r) => rowCitation(r) != null))

  return (
    <>
      {tables.map((t, ti) => (
        <div key={ti} style={{ marginBottom: 20, overflowX: "auto" }}>
          {tables.length > 1 && t.title && (
            <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: BRAND }}>{t.title}</h3>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${BRAND}` }}>
                <th style={{ ...TH, textAlign: "left" }}>Metric</th>
                <th style={{ ...TH, textAlign: "right" }}>Value</th>
                {showSource && <th style={{ ...TH, textAlign: "left" }}>Source</th>}
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, i) => {
                const state = rowBlankState(r)
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #F1F2F6" }}>
                    <td style={{ padding: "9px 10px", color: INK }}>
                      {stringifyCell(cell(r, "label", "metric", "name"))}
                    </td>
                    {state === "gap" ? (
                      <td style={{ padding: "9px 10px", textAlign: "right" }}>
                        <GapChip text={gapReason(r) ?? "Gap"} />
                      </td>
                    ) : state === "pending" ? (
                      <td style={{ padding: "9px 10px", textAlign: "right", fontStyle: "italic", color: MUTED }}>
                        Pending
                      </td>
                    ) : (
                      <td style={VALUE_CELL}>
                        {stringifyCell(cell(r, "current_display", "current", "value")) || "—"}
                      </td>
                    )}
                    {showSource && (
                      <td style={{ padding: "9px 10px", color: MUTED, fontSize: 11.5 }}>{rowCitation(r) ?? ""}</td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </>
  )
}

// Non-IFRS reconciliation (S15) — reported → adjustments → adjusted, per line,
// cited. Citation renders unconditionally per row here (the spec requires "per
// line, cited"), unlike the plain KPI table where the Source column is optional.
function ReconciliationTable({ content }: { content: string | null }) {
  const parsed = content ? tryParseJson(content) : undefined
  if (parsed === undefined) return null
  const tables = normalizeTables(parsed)
    .map((t) => ({ ...t, rows: t.rows.filter((r) => rowBlankState(r) !== "omitted") }))
    .filter((t) => t.rows.length > 0)
  if (tables.length === 0) return <Blank />

  return (
    <>
      {tables.map((t, ti) => (
        <div key={ti} style={{ marginBottom: 20, overflowX: "auto" }}>
          {tables.length > 1 && t.title && (
            <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: BRAND }}>{t.title}</h3>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${BRAND}` }}>
                <th style={{ ...TH, textAlign: "left" }}>Line item</th>
                <th style={{ ...TH, textAlign: "right" }}>Reported</th>
                <th style={{ ...TH, textAlign: "right" }}>Adjustments</th>
                <th style={{ ...TH, textAlign: "right" }}>Adjusted</th>
                <th style={{ ...TH, textAlign: "left" }}>Source</th>
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, i) => {
                const state = rowBlankState(r)
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #F1F2F6" }}>
                    <td style={{ padding: "9px 10px", color: INK }}>
                      {stringifyCell(cell(r, "label", "metric", "name"))}
                    </td>
                    {state === "gap" ? (
                      <td colSpan={3} style={{ padding: "9px 10px", textAlign: "right" }}>
                        <GapChip text={gapReason(r) ?? "Gap"} />
                      </td>
                    ) : state === "pending" ? (
                      <td colSpan={3} style={{ padding: "9px 10px", textAlign: "right", fontStyle: "italic", color: MUTED }}>
                        Pending
                      </td>
                    ) : (
                      <>
                        <td style={VALUE_CELL}>{stringifyCell(cell(r, "reported_display", "reported")) || "—"}</td>
                        <td style={VALUE_CELL}>
                          {stringifyCell(cell(r, "adjustments_display", "adjustment_display", "adjustments")) || "—"}
                        </td>
                        <td style={VALUE_CELL}>{stringifyCell(cell(r, "adjusted_display", "adjusted")) || "—"}</td>
                      </>
                    )}
                    <td style={{ padding: "9px 10px", color: MUTED, fontSize: 11.5 }}>{rowCitation(r) ?? ""}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </>
  )
}

// ─── quote ────────────────────────────────────────────────────────────────────
// Management commentary (S05) — verbatim quote + attribution. Field names read
// defensively across the likely aliases.
function QuoteBlock({ content }: { content: string | null }) {
  const parsed = content ? tryParseJson(content) : undefined
  const o = isRecord(parsed) ? parsed : {}
  const quote = cell(o, "quote", "text")
  // Omitted by design — no placeholder, no "quote unavailable" (D-12/D-20).
  if (typeof quote !== "string" || quote.trim() === "") return null

  const attribution = isRecord(o.attribution) ? o.attribution : o
  const name = cell(attribution, "name", "attributed_to")
  const title = cell(attribution, "title", "role")
  const hasAttribution =
    (typeof name === "string" && name !== "") || (typeof title === "string" && title !== "")

  return (
    <div>
      <blockquote
        style={{
          margin: 0,
          borderLeft: `3px solid ${BRAND}`,
          paddingLeft: 16,
          fontSize: 15,
          fontStyle: "italic",
          color: INK,
          lineHeight: 1.7,
        }}
      >
        &ldquo;{quote}&rdquo;
      </blockquote>
      {hasAttribution && (
        <p style={{ margin: "10px 0 0 19px", fontSize: 12.5, color: MUTED }}>
          — {[name, title].filter((v): v is string => typeof v === "string" && v !== "").join(", ")}
        </p>
      )}
    </div>
  )
}

// ─── sources ──────────────────────────────────────────────────────────────────
interface SourceCitationLine {
  label: string
  period: string | null
  filename: string | null
  page: string | null
  note: string | null
}

// One "<Label>: <rest>" line. `rest` is either "<period> · <filename> · <page>"
// (a real citation) or a bare note with no " · " at all (e.g. a derived figure's
// formula) — never guessed, just split on the structure the backend sends.
function parseSourcesContent(content: string): SourceCitationLine[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): SourceCitationLine => {
      const idx = line.indexOf(":")
      if (idx === -1) return { label: line, period: null, filename: null, page: null, note: null }
      const label = line.slice(0, idx).trim()
      const rest = line.slice(idx + 1).trim()
      const segments = rest.split("·").map((s) => s.trim()).filter(Boolean)
      if (segments.length >= 2) {
        const [period, filename, page] = segments
        return { label, period: period ?? null, filename: filename ?? null, page: page ?? null, note: null }
      }
      return { label, period: null, filename: null, page: null, note: rest || null }
    })
}

function SourcesList({ content }: { content: string }) {
  const lines = parseSourcesContent(content)
  if (lines.length === 0) return null

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {lines.map((l, i) => (
        <div
          key={`${l.label}-${i}`}
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 14,
            padding: "10px 2px",
            borderTop: i > 0 ? `1px solid ${BORDER}` : "none",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: INK, flexShrink: 0 }}>{l.label}</span>
          {l.note ? (
            <span style={{ fontSize: 12, color: FAINT, fontStyle: "italic", textAlign: "right" }}>
              Derived · {l.note}
            </span>
          ) : (
            <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, fontSize: 12, color: MUTED }}>
              {l.period && <span style={{ fontWeight: 700, color: INK, flexShrink: 0 }}>{l.period}</span>}
              {l.filename && (
                <span
                  style={{
                    fontFamily: MONO,
                    color: FAINT,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 220,
                  }}
                  title={l.filename}
                >
                  {l.filename}
                </span>
              )}
              {l.page && (
                <span
                  style={{
                    flexShrink: 0,
                    padding: "2px 8px",
                    borderRadius: 20,
                    background: "#EEF0F6",
                    color: MUTED,
                    fontSize: 10.5,
                    fontWeight: 700,
                  }}
                >
                  {l.page}
                </span>
              )}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── helpers ──────────────────────────────────────────────────────────────────
type LooseRow = Record<string, unknown>
interface NormTable {
  title?: string
  rows: LooseRow[]
}

function tryParseJson(s: string): unknown | undefined {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}
function isRecord(v: unknown): v is LooseRow {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}
function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined
}
// First non-null value across alias keys (e.g. label|metric|name).
function cell(r: LooseRow, ...keys: string[]): unknown {
  for (const k of keys) if (r[k] != null) return r[k]
  return null
}
function stringifyCell(v: unknown): string {
  if (v == null) return ""
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}

// Accepts every envelope shape: [{title, rows}], bare row array, {tables:[...]},
// {title, rows}, {title, entries:[...]}, or a plain object → key/value rows.
function normalizeTables(parsed: unknown): NormTable[] {
  if (parsed == null) return []
  if (Array.isArray(parsed)) {
    if (parsed.length && isRecord(parsed[0]) && Array.isArray((parsed[0] as LooseRow).rows)) {
      return (parsed as LooseRow[]).map((t) => ({
        title: asString(t.title),
        rows: Array.isArray(t.rows) ? (t.rows as LooseRow[]) : [],
      }))
    }
    return [{ rows: parsed.filter(isRecord) as LooseRow[] }]
  }
  if (isRecord(parsed)) {
    if (Array.isArray(parsed.tables)) {
      return (parsed.tables as LooseRow[]).map((t) => ({
        title: asString(t.title),
        rows: Array.isArray(t.rows) ? (t.rows as LooseRow[]) : [],
      }))
    }
    if (Array.isArray(parsed.rows)) {
      return [{ title: asString(parsed.title), rows: parsed.rows as LooseRow[] }]
    }
    // `{title, entries:[{label, value}]}` envelope (Reporting Calendar / IR
    // Contact) → a label/value table, each entry a row.
    if (Array.isArray(parsed.entries)) {
      return [{ title: asString(parsed.title), rows: parsed.entries.filter(isRecord) as LooseRow[] }]
    }
    // Plain object → 2-column key/value table. `title` is a caption, not a row.
    return [
      {
        title: asString(parsed.title),
        rows: Object.entries(parsed)
          .filter(([k]) => k !== "title")
          .map(([k, v]) => ({ label: k, current_display: stringifyCell(v) })),
      },
    ]
  }
  return []
}

// ─── row-level three-state reading (D-12) ─────────────────────────────────────
// "A blank must read as what it is", at line-item granularity — distinguishes a
// row still awaiting production, a specific gap (with a reason), and a row the
// backend omitted entirely.
type RowBlankState = "value" | "pending" | "gap" | "omitted"

function gapReason(row: LooseRow): string | null {
  const v = cell(row, "gap_reason", "gap_message")
  return typeof v === "string" && v ? v : null
}

function rowBlankState(row: LooseRow): RowBlankState {
  const status = cell(row, "row_status", "status")
  if (status === "omitted") return "omitted"
  if (status === "pending") return "pending"
  if (status === "gap" || gapReason(row) != null) return "gap"
  const hasValue =
    stringifyCell(cell(row, "current_display", "current", "value", "reported_display", "adjusted_display")) !== ""
  return hasValue ? "value" : "pending"
}

// Per-row citation text ("<label> · <ref>"), shared by both tables.
function rowCitation(row: LooseRow): string | null {
  const parts = [cell(row, "source_label"), cell(row, "source_ref", "page")].filter(
    (v): v is string => typeof v === "string" && v !== "",
  )
  return parts.length ? parts.join(" · ") : null
}

interface CoverValues {
  companyName: string | null
  title: string | null
  period: string | null
  preparedOn: string | null
  templateKey: string | null
}

// Read the cover envelope { template_key, layout, values:{...} } defensively.
function readCoverValues(content: string | null, fallbackTemplateKey: string | null): CoverValues {
  const parsed = content ? tryParseJson(content) : undefined
  const o = isRecord(parsed) ? parsed : {}
  const values = isRecord(o.values) ? o.values : o
  const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null)
  return {
    companyName: str(values.company_name) ?? str(values.company),
    title: str(values.title),
    period: str(values.period_label) ?? str(values.period),
    preparedOn: str(values.prepared_on) ?? str(values.prepared_at),
    templateKey: str(o.template_key) ?? str(o.templateKey) ?? fallbackTemplateKey,
  }
}
