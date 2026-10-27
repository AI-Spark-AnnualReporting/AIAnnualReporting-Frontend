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

import { LANDSCAPE_TEMPLATE_NAMES } from "@/lib/orientation"

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

/**
 * A column of text lines that runs to the foot of the card whatever its
 * height. This card is drawn twice the width of the portrait ones, so a fixed
 * handful of lines left most of the sheet blank and read as an empty page.
 */
const ruledColumn: React.CSSProperties = {
  flex: 1,
  backgroundImage: "repeating-linear-gradient(to bottom, #D7DAE5 0 2.5px, transparent 2.5px 5px)",
}

/**
 * The landscape section page, drawn sideways: title, a strip of six figures on
 * one row, the picture band, then prose in three columns. Its own shape
 * because a portrait-proportioned card would misdescribe the paper.
 */
/**
 * The shape of a landscape thumbnail: A4 on its side, or the wider 16:9
 * presentation sheet.
 */
function landscapeRatio(presentation: boolean): string {
  return presentation ? "16 / 9" : "1.414 / 1"
}

function LandscapeColumnsMini({ accent, presentation }: { accent: string; presentation: boolean }) {
  return (
    <div style={{ ...shell, aspectRatio: landscapeRatio(presentation), padding: 9, gap: 4 }}>
      <div style={line("10%", accent, 3)} />
      <div style={line("46%", "#9AA0B4", 5)} />
      <div style={{ ...line("100%", "#E4E6F1", 1), marginTop: 1 }} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 3,
          background: "#F4F0F7",
          padding: 3,
          flexShrink: 0,
        }}
      >
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i}>
            <div style={line("70%", accent, 5)} />
            <div style={{ ...line("90%"), marginTop: 1.5 }} />
          </div>
        ))}
      </div>
      <div style={ph({ flex: "0 0 24%" })} />
      <div style={{ display: "flex", gap: 6, flex: 1 }}>
        <div style={ruledColumn} />
        <div style={ruledColumn} />
        <div style={ruledColumn} />
      </div>
    </div>
  )
}

/**
 * The coral the landscape pages set their figures in (the brand's accent ink
 * on the real page). Fixed here, like the other minis' greys: the card only
 * has to say "the big numbers are here".
 */
const CORAL = "#F58675"

/**
 * The figure-rail landscape page, drawn sideways: title top-left, prose in two
 * columns across the left two-thirds, and a tinted rail down the right holding
 * the picture, the key figures stacked one under another, then a quote.
 */
function LandscapeRailMini({ accent, presentation }: { accent: string; presentation: boolean }) {
  return (
    <div style={{ ...shell, aspectRatio: landscapeRatio(presentation), padding: 9, gap: 4 }}>
      <div style={line("10%", accent, 3)} />
      <div style={line("40%", "#9AA0B4", 5)} />
      <div style={{ ...line("100%", "#E4E6F1", 1), marginTop: 1 }} />
      <div style={{ display: "flex", gap: 8, flex: 1 }}>
        <div style={{ display: "flex", gap: 6, flex: 2 }}>
          <div style={ruledColumn} />
          <div style={ruledColumn} />
        </div>
        <div
          style={{
            flex: 1,
            background: "#F4F0F7",
            padding: 4,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={ph({ flex: "0 0 32%" })} />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i}>
              <div style={line("55%", CORAL, 7)} />
              <div style={{ ...line("80%"), marginTop: 2 }} />
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <div style={line("90%", accent, 2)} />
          <div style={line("65%", accent, 2)} />
        </div>
      </div>
    </div>
  )
}

/**
 * The brand-hero landscape page, drawn sideways: a brand-colour band across
 * the top carrying the title, one giant figure and a row of small ones; below
 * it prose in two wide columns with the picture beside them.
 */
function LandscapeHeroMini({ accent, presentation }: { accent: string; presentation: boolean }) {
  return (
    <div style={{ ...shell, aspectRatio: landscapeRatio(presentation), padding: 0, gap: 0 }}>
      <div
        style={{
          background: accent,
          padding: "8px 9px",
          flex: "0 0 40%",
          display: "flex",
          gap: 10,
        }}
      >
        <div style={{ flex: "0 0 38%", display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={line("30%", "rgba(255,255,255,0.65)", 2)} />
          <div style={line("85%", "rgba(255,255,255,0.95)", 5)} />
          <div style={{ flex: 1 }} />
          <div style={line("80%", CORAL, 20)} />
          <div style={line("60%", "rgba(255,255,255,0.8)", 2.5)} />
        </div>
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 5,
            alignContent: "end",
          }}
        >
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i}>
              <div style={line("70%", "rgba(255,255,255,0.95)", 5)} />
              <div style={{ ...line("90%", "rgba(255,255,255,0.55)", 2), marginTop: 2 }} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flex: 1, padding: 9 }}>
        <div style={{ display: "flex", gap: 6, flex: 2 }}>
          <div style={ruledColumn} />
          <div style={ruledColumn} />
        </div>
        <div style={ph({ flex: 1 })} />
      </div>
    </div>
  )
}

/**
 * The picture-spread landscape page, drawn sideways like two facing magazine
 * pages: a picture fills the left half to the trim, and the right half holds
 * the title, the key figures three across, then the start of the text.
 */
function LandscapePictureMini({ accent, presentation }: { accent: string; presentation: boolean }) {
  return (
    <div style={{ ...shell, aspectRatio: landscapeRatio(presentation), padding: 0, gap: 0 }}>
      <div style={{ display: "flex", flex: 1 }}>
        <div
          style={ph({
            flex: "0 0 50%",
            borderRadius: 0,
            border: "none",
            borderRight: "1px solid #B8BCC8",
          })}
        />
        <div style={{ flex: 1, padding: 9, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={line("14%", accent, 3)} />
          <div style={line("70%", "#9AA0B4", 5)} />
          <div style={{ ...line("100%", "#E4E6F1", 1), marginTop: 1 }} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 5,
              flexShrink: 0,
            }}
          >
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i}>
                <div style={line("60%", CORAL, 6)} />
                <div style={{ ...line("85%"), marginTop: 2 }} />
              </div>
            ))}
          </div>
          <div style={{ ...ruledColumn, marginTop: 2 }} />
        </div>
      </div>
    </div>
  )
}

/**
 * The statement landscape page, drawn sideways: a brand-colour panel down the
 * left third holding a small portrait and one quote set large, and on the
 * right the title, the salutation, the letter in two columns and the
 * signature at the end of the second column.
 */
function LandscapeStatementMini({ accent, presentation }: { accent: string; presentation: boolean }) {
  return (
    <div style={{ ...shell, aspectRatio: landscapeRatio(presentation), padding: 0, gap: 0 }}>
      <div style={{ display: "flex", flex: 1 }}>
        <div
          style={{
            flex: "0 0 33%",
            background: accent,
            padding: 9,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={ph({ width: "42%", aspectRatio: "3 / 4" })} />
          <div style={{ flex: 1 }} />
          <div style={line("12%", CORAL, 4)} />
          <div style={line("92%", "rgba(255,255,255,0.85)", 5)} />
          <div style={line("70%", "rgba(255,255,255,0.85)", 5)} />
          <div style={{ ...line("45%", "rgba(255,255,255,0.55)", 2), marginTop: 2 }} />
        </div>
        <div style={{ flex: 1, padding: 9, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={line("10%", accent, 3)} />
          <div style={line("50%", "#9AA0B4", 5)} />
          <div style={{ ...line("100%", "#E4E6F1", 1), marginTop: 1 }} />
          <div style={line("24%", "#6B7085", 3)} />
          <div style={{ display: "flex", gap: 6, flex: 1 }}>
            <div style={ruledColumn} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={ruledColumn} />
              <div style={{ ...line("30%", accent, 2), marginTop: 2 }} />
              <div style={line("55%", "#9AA0B4", 3)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * The schedule landscape page, drawn sideways: the title and a short
 * introduction across the top, a brand rule, then one big table across the
 * full width — the tables are the point of the page.
 */
function LandscapeScheduleMini({ accent, presentation }: { accent: string; presentation: boolean }) {
  // One table row: the line label on the left, the figures right-aligned in
  // their columns.
  const tableRow = (shaded: boolean, index: number) => (
    <div
      key={index}
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "0 4px",
        background: shaded ? "#F7F4F9" : "#fff",
        borderBottom: "0.5px solid #EDEFF6",
      }}
    >
      <div style={line("26%", "#C3C7D4", 2.5)} />
      <div style={{ flex: 1 }} />
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} style={{ width: "9%", display: "flex", justifyContent: "flex-end" }}>
          <div style={line("70%", "#AEB3C2", 2.5)} />
        </div>
      ))}
    </div>
  )
  return (
    <div style={{ ...shell, aspectRatio: landscapeRatio(presentation), padding: 9, gap: 4 }}>
      <div style={line("10%", accent, 3)} />
      <div style={line("40%", "#9AA0B4", 5)} />
      <div style={line("72%")} />
      <div style={line("54%")} />
      <div style={{ ...line("100%", accent, 1.5), marginTop: 2 }} />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, marginTop: 2 }}>
        <div
          style={{
            height: 8,
            background: accent,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "0 4px",
          }}
        >
          <div style={line("16%", "rgba(255,255,255,0.8)", 2)} />
          <div style={{ flex: 1 }} />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} style={{ width: "9%", display: "flex", justifyContent: "flex-end" }}>
              <div style={line("60%", "rgba(255,255,255,0.8)", 2)} />
            </div>
          ))}
        </div>
        {Array.from({ length: 8 }, (_, i) => tableRow(i % 2 === 1, i))}
      </div>
    </div>
  )
}

/**
 * The essay landscape page, drawn sideways: three columns, the first of them
 * an opening column holding the title, the quotes in coral and a picture at
 * its foot, the other two ruled with the text.
 */
function LandscapeEssayMini({ accent, presentation }: { accent: string; presentation: boolean }) {
  return (
    <div style={{ ...shell, aspectRatio: landscapeRatio(presentation), padding: 9, gap: 4 }}>
      <div style={{ display: "flex", gap: 8, flex: 1 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={line("24%", accent, 3)} />
          <div style={line("90%", "#9AA0B4", 5)} />
          <div style={line("65%", "#9AA0B4", 5)} />
          <div style={{ ...line("30%", CORAL, 1.5), marginTop: 4 }} />
          <div style={line("95%", CORAL, 3.5)} />
          <div style={line("88%", CORAL, 3.5)} />
          <div style={line("60%", CORAL, 3.5)} />
          <div style={{ flex: 1 }} />
          <div style={ph({ flex: "0 0 34%" })} />
        </div>
        <div style={ruledColumn} />
        <div style={ruledColumn} />
      </div>
    </div>
  )
}

/** The inks of a group of stat tiles: one set on white, one on the brand colour. */
interface TileInks {
  label: string
  figure: string
  unit: string
  hairline: string
}

/** The tile inks on white: grey labels, coral figures, the unit in the brand colour. */
function tileInksOnWhite(accent: string): TileInks {
  return { label: "#C3C7D4", figure: CORAL, unit: accent, hairline: "#E4E6F1" }
}

/** The tile inks on the brand colour: white at several strengths. */
const TILE_INKS_ON_BRAND: TileInks = {
  label: "rgba(255,255,255,0.55)",
  figure: "rgba(255,255,255,0.95)",
  unit: "rgba(255,255,255,0.75)",
  hairline: "rgba(255,255,255,0.3)",
}

/**
 * One stat tile: the label over two lines, the figure, the unit line, then
 * the comparison with the year before. Its lower part stays empty, as on the
 * page.
 */
function statTile(inks: TileInks) {
  return (
    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={line("78%", inks.label, 2)} />
      <div style={line("52%", inks.label, 2)} />
      <div style={{ ...line("60%", inks.figure, 9), marginTop: 1 }} />
      <div style={line("34%", inks.unit, 2.5)} />
      <div style={{ ...line("70%", inks.label, 2), marginTop: 2 }} />
    </div>
  )
}

/**
 * Four stat tiles two by two, on a three-by-three grid: the tiles in the
 * corners, the hairlines in the 1px middle tracks and the centre cell left
 * empty, so the lines stop short of each other where they cross, as on the
 * page.
 */
function statTileGroup(inks: TileInks) {
  return (
    <div
      style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "1fr 1px 1fr",
        gridTemplateRows: "1fr 1px 1fr",
        gap: 5,
      }}
    >
      {statTile(inks)}
      <div style={{ background: inks.hairline }} />
      {statTile(inks)}
      <div style={{ background: inks.hairline }} />
      <div />
      <div style={{ background: inks.hairline }} />
      {statTile(inks)}
      <div style={{ background: inks.hairline }} />
      {statTile(inks)}
    </div>
  )
}

/**
 * The stat-tiles landscape page, drawn sideways like two facing pages: the
 * title and four figure tiles two by two on the white left half, four more on
 * the right half in the brand colour, hairlines between the tiles and nothing
 * in the fold. The text follows on a later sheet, so it is not drawn.
 */
function LandscapeTilesMini({ accent, presentation }: { accent: string; presentation: boolean }) {
  // The band above the tiles. Both halves keep one of the same depth, so the
  // tile rows stay level across the fold as on the page.
  const header: React.CSSProperties = {
    flex: "0 0 22px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  }
  return (
    <div
      style={{
        ...shell,
        aspectRatio: landscapeRatio(presentation),
        flexDirection: "row",
        padding: 0,
        gap: 0,
      }}
    >
      {/* The fold is split at the middle of the sheet: half of it white, half
          in the brand colour. Together the two insets give the same fold as
          the data-tables card, about a tenth of the width. */}
      <div
        style={{
          flex: 1,
          padding: "9px 5.5% 9px 9px",
          display: "flex",
          flexDirection: "column",
          gap: 5,
        }}
      >
        <div style={header}>
          <div style={line("16%", accent, 3)} />
          <div style={line("64%", "#9AA0B4", 5)} />
        </div>
        {statTileGroup(tileInksOnWhite(accent))}
      </div>
      {/* The brand half starts at the safe top, beside the title, and bleeds
          to the side trim only: the page never runs it under the stamped
          header or footer. */}
      <div
        style={{
          flex: 1,
          margin: "9px 0",
          padding: "0 9px 0 5.5%",
          background: accent,
          display: "flex",
          flexDirection: "column",
          gap: 5,
        }}
      >
        <div style={header} />
        {statTileGroup(TILE_INKS_ON_BRAND)}
      </div>
    </div>
  )
}

/**
 * One head of a data table's header row, with the page's short accent line
 * on its start edge. The head text sits at the bottom of the row.
 */
function tableHeadCell(width: string, ink: string) {
  return (
    <div
      style={{
        width,
        flexShrink: 0,
        display: "flex",
        alignItems: "flex-end",
        borderLeft: `1px solid ${CORAL}`,
        padding: "0 0 1px 2px",
      }}
    >
      <div style={line("60%", ink, 2)} />
    </div>
  )
}

/**
 * One cell of a data table's body row. It starts where its head's text
 * starts, just after the short line, as the figures do on the page.
 */
function tableBodyCell(width: string, ink: string) {
  return (
    <div style={{ width, flexShrink: 0, paddingLeft: 3 }}>
      <div style={line("60%", ink, 2)} />
    </div>
  )
}

/**
 * One body row of a data table: the line label, the current year (bold on
 * the page, so darker here), then the year before it.
 */
function tableBodyRow(shaded: boolean, index: number) {
  return (
    <div
      key={index}
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        alignItems: "center",
        background: shaded ? "#F7F4F9" : "#fff",
      }}
    >
      {tableBodyCell("52%", "#C3C7D4")}
      {tableBodyCell("24%", "#6B7085")}
      {tableBodyCell("24%", "#AEB3C2")}
    </div>
  )
}

/**
 * One data table under its title (the lead-in, in the brand colour): the
 * white header row, a group row as a brand bar when asked, then the rows,
 * every other one tinted starting with the first.
 */
function dataTable(accent: string, rows: number, withGroupBar: boolean) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={line("58%", accent, 2.5)} />
      <div style={{ height: 8, marginTop: 3, flexShrink: 0, display: "flex" }}>
        {tableHeadCell("52%", "#6B7085")}
        {tableHeadCell("24%", "#6B7085")}
        {tableHeadCell("24%", "#AEB3C2")}
      </div>
      {withGroupBar && (
        <div
          style={{
            height: 6,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            paddingLeft: 3,
            background: accent,
          }}
        >
          <div style={line("20%", "rgba(255,255,255,0.85)", 2)} />
        </div>
      )}
      {Array.from({ length: rows }, (_, i) => tableBodyRow(i % 2 === 0, i))}
    </div>
  )
}

/**
 * The data-tables landscape page, drawn sideways like two facing pages with
 * the fold between them: on the left the subheading after its small square,
 * the opening text and a long table; on the right two more tables. Each table
 * sits under its title, with a short line at the start of each column head,
 * group rows in a brand bar and every other row tinted.
 */
function LandscapeTablesMini({ accent, presentation }: { accent: string; presentation: boolean }) {
  return (
    <div
      style={{
        ...shell,
        aspectRatio: landscapeRatio(presentation),
        flexDirection: "row",
        padding: 9,
        gap: 0,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
          <div style={{ width: 4, height: 4, background: CORAL, flexShrink: 0 }} />
          <div style={line("56%", accent, 3.5)} />
        </div>
        <div style={line("100%")} />
        <div style={{ ...line("72%"), marginBottom: 5 }} />
        {dataTable(accent, 16, true)}
      </div>
      {/* The fold: nothing is drawn in it on the page either. */}
      <div style={{ flex: "0 0 11%" }} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {dataTable(accent, 8, false)}
        {dataTable(accent, 8, true)}
      </div>
    </div>
  )
}

/**
 * One column of prose for the editorial minis: text lines, with a subheading
 * (a small square before a darker line) part way down when asked, and a bold
 * closing line in the brand colour for the quotes set as emphasis lines.
 */
function editorialColumn(accent: string, withHeading: boolean, withEmphasis: boolean) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2.5 }}>
      <div style={ruledColumn} />
      {withHeading && (
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0, marginTop: 2 }}>
          <div style={{ width: 3, height: 3, background: CORAL, flexShrink: 0 }} />
          <div style={line("62%", "#6B7085", 3)} />
        </div>
      )}
      <div style={ruledColumn} />
      {withEmphasis && <div style={line("78%", accent, 3.5)} />}
    </div>
  )
}

/**
 * The editorial-columns landscape page, drawn sideways: a white column on the
 * start side holding the title, and a tint over the rest of the first sheet
 * with the lead paragraph at its top. Four columns of text run under them,
 * with subheadings after a small square and the quotes as bold lines at the
 * end. The tint stays inside the safe area, as it does on the page.
 */
function LandscapeEditorialMini({ accent, presentation }: { accent: string; presentation: boolean }) {
  return (
    <div
      style={{
        ...shell,
        aspectRatio: landscapeRatio(presentation),
        flexDirection: "row",
        padding: 9,
        gap: 6,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={line("40%", CORAL, 3)} />
        <div style={line("92%", accent, 5)} />
        <div style={{ ...line("70%", accent, 5), marginBottom: 6 }} />
        {editorialColumn(accent, true, false)}
      </div>
      <div
        style={{
          flex: 3,
          minWidth: 0,
          background: "#F4F0F7",
          padding: 6,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ width: "62%", display: "flex", flexDirection: "column", gap: 3, flexShrink: 0 }}>
          <div style={line("100%", accent, 3.5)} />
          <div style={line("100%", accent, 3.5)} />
          <div style={line("64%", accent, 3.5)} />
        </div>
        <div style={{ flex: 1, display: "flex", gap: 6 }}>
          {editorialColumn(accent, false, false)}
          {editorialColumn(accent, true, false)}
          {editorialColumn(accent, false, true)}
        </div>
      </div>
    </div>
  )
}

/**
 * One key figure in the portrait + stats rail: the value in the figure
 * colour, its label, and the hairline under it with a small square.
 */
function railFigure(index: number) {
  return (
    <div key={index} style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minHeight: 0 }}>
      <div style={line("62%", CORAL, 5)} />
      <div style={line("88%")} />
      <div style={{ display: "flex", alignItems: "center", gap: 2, marginTop: "auto" }}>
        <div style={{ width: 2.5, height: 2.5, background: CORAL, flexShrink: 0 }} />
        <div style={line("100%", "#E4E6F1", 1)} />
      </div>
    </div>
  )
}

/**
 * The portrait + stats landscape page, drawn sideways: a tall portrait on the
 * left half with the featured quote on a brand plate at its foot (outside the
 * picture, as on the page); on the right half the letter beside a rail of
 * key figures.
 */
function LandscapePortraitMini({ accent, presentation }: { accent: string; presentation: boolean }) {
  return (
    <div
      style={{
        ...shell,
        aspectRatio: landscapeRatio(presentation),
        flexDirection: "row",
        padding: 9,
        gap: 9,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={ph({ flex: 1 })} />
        <div
          style={{
            background: accent,
            padding: 5,
            display: "flex",
            flexDirection: "column",
            gap: 2.5,
            flexShrink: 0,
          }}
        >
          <div style={line("92%", "rgba(255,255,255,0.95)", 3.5)} />
          <div style={line("70%", "rgba(255,255,255,0.95)", 3.5)} />
          <div style={{ ...line("34%", "rgba(255,255,255,0.7)", 2), marginTop: 2 }} />
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={line("30%", "#9AA0B4", 3)} />
          <div style={ruledColumn} />
          <div style={line("40%", "#6B7085", 3)} />
        </div>
        <div style={{ flex: "0 0 34%", display: "flex", flexDirection: "column", gap: 4 }}>
          {[0, 1, 2, 3].map((i) => railFigure(i))}
        </div>
      </div>
    </div>
  )
}

/**
 * The stat-tiles portrait page: the title and four figure tiles two by two on
 * white, then four more two by two on the brand colour across the lower half,
 * which runs to the side trims but stops above the footer, as on the page.
 * Hairlines between the tiles. More figures and the text follow on later
 * sheets, so they are not drawn.
 */
function StatTilesMini({ accent }: { accent: string }) {
  return (
    <div style={{ ...shell, padding: 0, gap: 0 }}>
      <div style={{ flex: 1, padding: "6px 7px 3px", display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
          <div style={line("16%", accent, 3)} />
          <div style={line("64%", "#9AA0B4", 5)} />
        </div>
        {statTileGroup(tileInksOnWhite(accent))}
      </div>
      <div
        style={{
          flex: 1,
          marginBottom: 6,
          padding: "5px 7px",
          background: accent,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {statTileGroup(TILE_INKS_ON_BRAND)}
      </div>
    </div>
  )
}

/**
 * The data-tables portrait page: the subheading after its small square, the
 * opening text, then the tables one under another across the full width, each
 * under its title with the same group bars, tinted rows and bold current year
 * as the landscape page.
 */
function DataTablesMini({ accent }: { accent: string }) {
  return (
    <div style={{ ...shell, gap: 3 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
        <div style={{ width: 4, height: 4, background: CORAL, flexShrink: 0 }} />
        <div style={line("56%", accent, 3.5)} />
      </div>
      <div style={line("100%")} />
      <div style={{ ...line("72%"), marginBottom: 4 }} />
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 7 }}>
        {dataTable(accent, 10, true)}
        {dataTable(accent, 8, false)}
      </div>
    </div>
  )
}

/**
 * The photo + panel landscape page: body text and a figure down the left, a
 * big photo bleeding off the top, right and bottom, and a solid brand panel
 * laid over the photo's left edge carrying text.
 */
function LandscapePhotoPanelMini({ accent, presentation }: { accent: string; presentation: boolean }) {
  return (
    <div
      style={{
        ...shell,
        aspectRatio: landscapeRatio(presentation),
        flexDirection: "row",
        padding: 0,
        gap: 0,
        position: "relative",
      }}
    >
      <div style={{ flex: "0 0 40%", padding: 9, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={line("48%", accent, 4)} />
        <div style={ruledColumn} />
        <div style={line("34%", CORAL, 5)} />
        <div style={line("70%")} />
      </div>
      <div style={ph({ position: "absolute", top: 0, right: 0, bottom: 0, width: "62%", borderRadius: 0 })} />
      <div
        style={{
          position: "absolute",
          top: "26%",
          left: "33%",
          width: "27%",
          bottom: "14%",
          background: accent,
          padding: 5,
          display: "flex",
          flexDirection: "column",
          gap: 2.5,
        }}
      >
        <div style={line("90%", "rgba(255,255,255,0.95)", 3)} />
        <div style={line("100%", "rgba(255,255,255,0.7)", 2)} />
        <div style={line("100%", "rgba(255,255,255,0.7)", 2)} />
        <div style={line("64%", "rgba(255,255,255,0.7)", 2)} />
      </div>
    </div>
  )
}

/** The portrait photo + panel page: photo across the top, panel over its lower edge, text below. */
function PhotoPanelMini({ accent }: { accent: string }) {
  return (
    <div style={{ ...shell, padding: 0, gap: 0, position: "relative" }}>
      <div style={ph({ flex: "0 0 46%", borderRadius: 0 })} />
      <div
        style={{
          position: "absolute",
          top: "36%",
          left: "14%",
          width: "72%",
          height: "24%",
          background: accent,
          padding: 5,
          display: "flex",
          flexDirection: "column",
          gap: 2.5,
        }}
      >
        <div style={line("80%", "rgba(255,255,255,0.95)", 3)} />
        <div style={line("100%", "rgba(255,255,255,0.7)", 2)} />
        <div style={line("56%", "rgba(255,255,255,0.7)", 2)} />
      </div>
      <div style={{ flex: 1, padding: "20% 7px 6px", display: "flex", flexDirection: "column", gap: 2.5 }}>
        <div style={line("100%")} />
        <div style={line("90%")} />
        <div style={line("34%", CORAL, 4)} />
        <div style={line("100%")} />
      </div>
    </div>
  )
}

/** One small headshot square with a name line under it. */
function personCell(key: number) {
  return (
    <div key={key} style={{ display: "flex", flexDirection: "column", gap: 1.5, minWidth: 0 }}>
      <div style={ph({ aspectRatio: "1 / 1", width: "100%" })} />
      <div style={line("80%", "#9AA0B4", 2)} />
    </div>
  )
}

/**
 * The people landscape page: a short rule, a lead statement and the intro on
 * the left with the featured person as one big square; on the right a 2 x 5
 * grid of small squares, each with its name line.
 */
function LandscapePeopleMini({ accent, presentation }: { accent: string; presentation: boolean }) {
  return (
    <div
      style={{
        ...shell,
        aspectRatio: landscapeRatio(presentation),
        flexDirection: "row",
        padding: 9,
        gap: 9,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={line("16%", CORAL, 2.5)} />
        <div style={line("88%", accent, 4)} />
        <div style={line("60%", accent, 4)} />
        <div style={line("100%")} />
        <div style={line("84%")} />
        <div style={ph({ flex: 1, minHeight: 0, aspectRatio: "1 / 1", alignSelf: "flex-start" })} />
        <div style={line("40%", "#6B7085", 3)} />
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gridTemplateRows: "repeat(2, 1fr)",
          gap: 4,
          alignContent: "start",
        }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => personCell(i))}
      </div>
    </div>
  )
}

/** The portrait people page: intro and the featured person on top, the grid stacked below. */
function PeopleGridMini({ accent }: { accent: string }) {
  return (
    <div style={{ ...shell, gap: 3 }}>
      <div style={line("16%", CORAL, 2.5)} />
      <div style={line("80%", accent, 4)} />
      <div style={line("100%")} />
      <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "flex-end" }}>
        <div style={ph({ width: "34%", aspectRatio: "1 / 1" })} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={line("70%", "#6B7085", 3)} />
          <div style={line("50%")} />
        </div>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gridTemplateRows: "repeat(2, 1fr)",
          gap: 3,
          alignContent: "start",
          marginTop: 3,
        }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => personCell(i))}
      </div>
    </div>
  )
}

/**
 * A custom template has no fixed look, so its card shows the real first sheet
 * when one has been drawn (see TemplateCardGrid). This is the stand-in until
 * then: an off-grid composition, deliberately unlike the fixed designs.
 */
function CustomMini({ accent, landscape, presentation }: {
  accent: string
  landscape: boolean
  presentation: boolean
}) {
  const ratio = landscape ? landscapeRatio(presentation) : "1 / 1.3"
  return (
    <div style={{ ...shell, aspectRatio: ratio, padding: 7, gap: 3 }}>
      <div style={line("58%", accent, 4)} />
      <div style={{ display: "flex", gap: 4, flex: 1 }}>
        <div style={ph({ width: "46%", height: "62%" })} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2.5, flex: 1, paddingTop: 6 }}>
          <div style={line("70%", accent, 6)} />
          <div style={line("40%")} />
          {col(5)}
        </div>
      </div>
    </div>
  )
}

function TemplateMiniInner({
  templateKey,
  accent = "#3C0866",
  presentation = false,
  landscape = false,
}: {
  templateKey: string
  accent?: string
  /** Draw a landscape thumbnail the 16:9 presentation shape. */
  presentation?: boolean
  /** Only read by the custom thumbnail, which has no key to say its shape. */
  landscape?: boolean
}) {
  if (templateKey === "custom") {
    return <CustomMini accent={accent} landscape={landscape} presentation={presentation} />
  }
  if (templateKey === "landscape_columns") {
    return <LandscapeColumnsMini accent={accent} presentation={presentation} />
  }
  if (templateKey === "landscape_rail") {
    return <LandscapeRailMini accent={accent} presentation={presentation} />
  }
  if (templateKey === "landscape_hero") {
    return <LandscapeHeroMini accent={accent} presentation={presentation} />
  }
  if (templateKey === "landscape_picture") {
    return <LandscapePictureMini accent={accent} presentation={presentation} />
  }
  if (templateKey === "landscape_statement") {
    return <LandscapeStatementMini accent={accent} presentation={presentation} />
  }
  if (templateKey === "landscape_schedule") {
    return <LandscapeScheduleMini accent={accent} presentation={presentation} />
  }
  if (templateKey === "landscape_essay") {
    return <LandscapeEssayMini accent={accent} presentation={presentation} />
  }
  if (templateKey === "landscape_tiles") {
    return <LandscapeTilesMini accent={accent} presentation={presentation} />
  }
  if (templateKey === "landscape_tables") {
    return <LandscapeTablesMini accent={accent} presentation={presentation} />
  }
  if (templateKey === "landscape_editorial") {
    return <LandscapeEditorialMini accent={accent} presentation={presentation} />
  }
  if (templateKey === "landscape_portrait") {
    return <LandscapePortraitMini accent={accent} presentation={presentation} />
  }

  if (templateKey === "landscape_photo_panel") {
    return <LandscapePhotoPanelMini accent={accent} presentation={presentation} />
  }
  if (templateKey === "landscape_people") {
    return <LandscapePeopleMini accent={accent} presentation={presentation} />
  }
  if (templateKey === "photo_panel") {
    return <PhotoPanelMini accent={accent} />
  }
  if (templateKey === "people_grid") {
    return <PeopleGridMini accent={accent} />
  }

  if (templateKey === "stat_tiles") {
    return <StatTilesMini accent={accent} />
  }
  if (templateKey === "data_tables") {
    return <DataTablesMini accent={accent} />
  }

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

  // The opening field (large standfirst over a numbered index of the
  // subheadings), then two numbered movements: a big coral numeral in the
  // margin rail beside the heading and its prose.
  if (templateKey === "editorial_movements") {
    const movement = (n: number) => (
      <div style={{ display: "flex", gap: 4, flex: 1, paddingTop: 4, borderTop: "1px dotted #DDC39B" }}>
        <div style={{ flex: "0 0 26%", display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 13, lineHeight: 1, color: "#F58675", fontWeight: 300 }}>{`0${n}`}</div>
          <div style={line("70%", "#C75111", 1.5)} />
          <div style={line("55%", accent, 3)} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2.5 }}>
          <div style={line("62%", accent, 3.5)} />
          {col(4)}
        </div>
      </div>
    )
    return (
      <div style={{ ...shell, gap: 4 }}>
        <div
          style={{
            background: accent,
            margin: "-7px 0 0 -7px",
            padding: "8px 7px 6px 7px",
            borderRadius: "0 0 6px 0",
            display: "flex",
            flexDirection: "column",
            gap: 2.5,
            flex: "0 0 40%",
          }}
        >
          <div style={line("30%", "#F58675", 1.5)} />
          <div style={line("94%", "#FFFFFF", 3)} />
          <div style={line("88%", "#F58675", 3)} />
          <div style={line("72%", "#FFFFFF", 3)} />
          <div style={{ flex: 1 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={line("80%", "rgba(255,255,255,0.55)", 1.5)} />
            ))}
          </div>
        </div>
        {movement(1)}
        {movement(2)}
      </div>
    )
  }

  // A tinted sheet: the title, the short lead paragraph in the brand colour,
  // then two columns of text with subheadings after a small square. The
  // closing brand line in the second column is the quotes, set as bold
  // emphasis lines after the text.
  if (templateKey === "editorial_columns") {
    return (
      <div style={{ ...shell, background: "#F4F0F7", gap: 4 }}>
        <div style={line("44%", accent, 4)} />
        <div style={{ width: "66%", display: "flex", flexDirection: "column", gap: 2.5, flexShrink: 0 }}>
          <div style={line("100%", accent, 3)} />
          <div style={line("100%", accent, 3)} />
          <div style={line("58%", accent, 3)} />
        </div>
        <div style={{ display: "flex", gap: 5, flex: 1, marginTop: 2 }}>
          {editorialColumn(accent, true, false)}
          {editorialColumn(accent, true, true)}
        </div>
      </div>
    )
  }

  // The figure column on the start side (left in English): four key figures,
  // each with its hairline and small square. Beside it the picture, the
  // brand plate for the featured quote, then the letter.
  if (templateKey === "statement_stat_rail") {
    return (
      <div style={{ ...shell, flexDirection: "row", gap: 5 }}>
        <div style={{ flex: "0 0 32%", display: "flex", flexDirection: "column", gap: 4 }}>
          {[0, 1, 2, 3].map((i) => railFigure(i))}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={ph({ flex: "0 0 34%" })} />
          <div style={{ background: accent, padding: 3, flexShrink: 0, marginTop: -3 }}>
            <div style={line("80%", "rgba(255,255,255,0.95)", 3)} />
            <div style={{ ...line("36%", "rgba(255,255,255,0.7)", 2), marginTop: 2 }} />
          </div>
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
 * Every prop is a primitive, so the five minis on the card grid stop rebuilding
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
  editorial_movements: "Editorial — movements",
  editorial_columns: "Editorial — columns",
  statement_stat_rail: "Statement — figure rail",
  stat_tiles: "Stat tiles",
  data_tables: "Data tables",
  photo_panel: "Photo + panel",
  people_grid: "People",
  custom: "Custom",
  ...LANDSCAPE_TEMPLATE_NAMES,
}
