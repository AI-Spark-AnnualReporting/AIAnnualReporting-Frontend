"use client"

/**
 * Schematic thumbnails of the page templates.
 *
 * Hand-drawn bars rather than a real render, for the same reason MiniCover is:
 * a grid of five live pages is far too heavy, and a card only needs to say
 * "this is the one with the big figure at the top". Clicking a card is what
 * fetches the real page.
 *
 * Each mini shows its template's image placeholder, or the card would be
 * lying about the layout it represents.
 *
 * Inline styles and numeric radii throughout, deliberately — see the note in
 * MiniCover.tsx about Tailwind v3/v4 palette and radius drift.
 */

import { memo } from "react"

const shell: React.CSSProperties = {
  width: "100%",
  aspectRatio: "1 / 1.3",
  borderRadius: 4,
  background: "#fff",
  border: "1px solid #E5E7EF",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  padding: 7,
  gap: 3,
}

const line = (w: string, c = "#D7DAE5", h = 2.5): React.CSSProperties => ({
  height: h,
  width: w,
  background: c,
  borderRadius: 1,
  flexShrink: 0,
})

/**
 * The placeholder motif — the same checkerboard the real page draws
 * (Centriton templates/pages/page.css `.imgph`). Squares are 3px here, not
 * the page's 16pt scaled down, which turns to mush at thumbnail size.
 */
const ph = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  backgroundColor: "#FFFFFF",
  backgroundImage: "repeating-conic-gradient(#E6E6E6 0% 25%, #FFFFFF 0% 50%)",
  backgroundSize: "6px 6px",
  backgroundPosition: "center",
  border: "1px solid #B8BCC8",
  borderRadius: 2,
  flexShrink: 0,
  ...extra,
})

const col = (n: number, w = "100%") => (
  <div style={{ display: "flex", flexDirection: "column", gap: 2.5, flex: 1, width: w }}>
    {Array.from({ length: n }, (_, i) => (
      <div key={i} style={line(i === n - 1 ? "70%" : "100%")} />
    ))}
  </div>
)

function TemplateMiniInner({
  templateKey,
  accent = "#3C0866",
}: {
  templateKey: string
  accent?: string
}) {
  if (templateKey === "kpi_stat_grid") {
    return (
      <div style={{ ...shell, padding: 0, gap: 0 }}>
        <div style={{ background: accent, padding: 7, flex: "0 0 38%" }}>
          <div style={line("30%", "rgba(255,255,255,0.65)", 2)} />
          <div style={{ ...line("62%", "rgba(255,255,255,0.95)", 5), marginTop: 4 }} />
          <div style={{ ...line("48%", "rgba(255,255,255,0.9)", 11), marginTop: 6 }} />
        </div>
        <div style={{ padding: 7, display: "flex", flexDirection: "column", gap: 2.5, flex: 1 }}>
          <div style={line("85%")} />
          <div style={line("60%")} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 1,
              background: "#E4E6F1",
              flex: 1,
              marginTop: 3,
            }}
          >
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} style={{ background: "#fff", padding: 3 }}>
                <div style={line("70%", accent, 4)} />
                <div style={{ ...line("85%"), marginTop: 2 }} />
              </div>
            ))}
            <div style={ph()} />
          </div>
        </div>
      </div>
    )
  }

  if (templateKey === "statement_letter") {
    return (
      <div style={{ ...shell, padding: 0, gap: 0 }}>
        <div style={{ background: accent, padding: 7, flex: "0 0 34%" }}>
          <div style={line("28%", "rgba(255,255,255,0.65)", 2)} />
          <div style={{ ...line("78%", "rgba(255,255,255,0.95)", 5), marginTop: 4 }} />
          <div style={{ ...line("55%", "rgba(255,255,255,0.8)", 4), marginTop: 4 }} />
        </div>
        <div style={{ padding: 7, display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
          <div style={line("30%", "#9AA0B4", 3)} />
          <div style={{ display: "flex", gap: 4, flex: 1 }}>
            <div style={ph({ flex: "0 0 26%" })} />
            {col(5)}
          </div>
          <div style={{ ...line("18%", accent, 2), marginTop: 1 }} />
          <div style={line("45%", "#9AA0B4", 3)} />
        </div>
      </div>
    )
  }

  // The card shows the OPENER sheet, because that is what distinguishes this
  // template — the body sheets that follow are three plain columns and would
  // be indistinguishable from the prose card at this size.
  if (templateKey === "executive_statement") {
    return (
      <div style={{ ...shell, padding: 0, gap: 0 }}>
        <div
          style={{
            padding: 7,
            flex: "0 0 55%",
            display: "flex",
            flexDirection: "column",
            borderLeft: `1px solid ${accent}`,
            margin: "7px 0 0 7px",
            position: "relative",
          }}
        >
          {/* the node dot that sits on the rule */}
          <div
            style={{
              position: "absolute",
              left: -3,
              top: -3,
              width: 5,
              height: 5,
              borderRadius: 3,
              border: `1px solid ${accent}`,
              background: "#fff",
            }}
          />
          <div style={line("34%", "#9AA0B4", 2)} />
          <div style={{ ...line("92%", accent, 5), marginTop: 5 }} />
          <div style={{ ...line("86%", accent, 5), marginTop: 3 }} />
          <div style={{ ...line("58%", accent, 5), marginTop: 3 }} />
          <div style={{ flex: 1 }} />
          <div style={line("46%", "#6B7085", 3)} />
          <div style={{ ...line("38%", "#9AA0B4", 2), marginTop: 2 }} />
        </div>
        {/* full-bleed portrait area, hard to the right and bottom trim */}
        <div
          style={ph({
            flex: 1,
            margin: "5px 0 0 7px",
            borderRadius: "4px 0 0 0",
            borderRight: "none",
            borderBottom: "none",
          })}
        />
      </div>
    )
  }

  // Two sheets in one card, because the alternation IS the template: the
  // quote-and-photo sheet on top, the photo grid underneath, split by a
  // hairline for the page turn.
  if (templateKey === "editorial_alternating") {
    return (
      <div style={{ ...shell, gap: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 2 }}>
          <div style={{ display: "flex", gap: 3, flex: "0 0 46%" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2.5, paddingTop: 2 }}>
              <div style={line("92%", accent, 4)} />
              <div style={line("84%", accent, 4)} />
              <div style={line("60%", accent, 4)} />
              <div style={{ flex: 1 }} />
              <div style={line("40%", "#6B7085", 2)} />
            </div>
            <div
              style={ph({
                flex: 1,
                borderLeft: `1px solid ${accent}`,
                borderBottom: `1px solid ${accent}`,
                borderRadius: "0 0 0 4px",
                marginRight: -7,
              })}
            />
          </div>
          <div style={{ display: "flex", gap: 3, flex: 1 }}>
            {col(4)}
            {col(4)}
            {col(4)}
          </div>
        </div>
        <div style={{ ...line("100%", "#E4E6F1", 1), margin: "4px 0" }} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gridTemplateRows: "repeat(2, 1fr)",
            gap: 3,
            flex: "0 0 38%",
          }}
        >
          {col(4)}
          {col(4)}
          <div style={ph({ borderRadius: 2 })} />
          {col(4)}
          <div style={ph({ borderRadius: 2 })} />
          {col(4)}
        </div>
      </div>
    )
  }

  if (templateKey === "financial_table") {
    return (
      <div style={shell}>
        <div style={line("14%", accent, 3)} />
        <div style={line("68%", "#9AA0B4", 5)} />
        <div style={{ ...line("100%", "#E4E6F1", 1), marginTop: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, marginTop: 3 }}>
          <div style={{ height: 6, background: accent, flexShrink: 0 }} />
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              style={{
                height: 6,
                background: i % 2 ? "#F7F4F9" : "#fff",
                borderBottom: "0.5px solid #EDEFF6",
                display: "flex",
                flexShrink: 0,
              }}
            >
              <div style={{ width: "55%", borderRight: "1px solid #fff" }} />
              <div style={{ width: "25%", borderRight: "1px solid #fff" }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const withStats = templateKey === "narrative_with_stats"
  return (
    <div style={shell}>
      <div style={line("14%", accent, 3)} />
      <div style={line("72%", "#9AA0B4", 5)} />
      <div style={{ ...line("100%", "#E4E6F1", 1), marginTop: 1 }} />
      {withStats && (
        <div
          style={{
            display: "flex",
            gap: 3,
            background: "#F4F0F7",
            padding: 3,
            marginTop: 2,
            flexShrink: 0,
          }}
        >
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} style={{ flex: 1 }}>
              <div style={line("70%", accent, 5)} />
              <div style={{ ...line("90%"), marginTop: 1.5 }} />
            </div>
          ))}
        </div>
      )}
      <div style={ph({ height: withStats ? 13 : 20, marginTop: 3 })} />
      <div style={{ display: "flex", gap: 4, flex: 1, marginTop: 3 }}>
        {col(withStats ? 4 : 6)}
        {col(withStats ? 4 : 6)}
      </div>
      <div style={{ ...line("35%", "#E4E6F1", 2), marginTop: 2 }} />
    </div>
  )
}

/**
 * Both props are primitives, so the five minis on the card grid stop rebuilding
 * their few dozen inline-style objects every time the selected card changes.
 * Cheap either way — this is tidiness, not a fix for anything measured.
 */
export const TemplateMini = memo(TemplateMiniInner)

/** Human names, used on the cards and in the rail chips. */
export const TEMPLATE_NAMES: Record<string, string> = {
  narrative_text_heavy: "Prose",
  narrative_with_stats: "Prose + figures",
  kpi_stat_grid: "Figure grid",
  financial_table: "Table",
  statement_letter: "Letter",
  executive_statement: "Executive statement",
  editorial_alternating: "Editorial — alternating",
}
