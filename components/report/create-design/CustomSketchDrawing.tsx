"use client"

/**
 * One layout of a sketch, drawn in the browser: no printing, no server call.
 *
 * Boxes are placed by % of the page, measured from the side where reading
 * starts (insetInlineStart inside a `dir` container), so an Arabic page mirrors
 * the way the printed one will. The image areas use the real page's
 * checkerboard; colour blocks use the report's own brand colours, which the
 * sketch record carries.
 *
 * Inline styles throughout, like TemplateMini: globals.css overrides Tailwind's
 * border colours everywhere outside the report-design dialog.
 */

import { memo, type CSSProperties } from "react"

import type { CustomSketchRecord, SketchBox, SketchLayout } from "@/lib/api/createDesign"
import { boxLabel, shapeStyle } from "@/lib/customSketch"

type SheetFacts = Pick<CustomSketchRecord, "page_pt" | "safe_inset_pt" | "colours">

// Painting order: picture and colour areas at the back (in the order the
// sketch lists them: a colour panel may sit on a picture or under it), then
// figures and quotes, then text on top. The backend lists boxes for the
// designer in the same order (custom_sketch_service.paint_order).
const LAYER: Record<SketchBox["role"], number> = { colour: 0, image: 0, figures: 1, quotes: 1, text: 2 }

// The placeholder checkerboard, copied from TemplateMini.tsx ph(): the look of
// the real page's image areas (Centriton .imgph).
const CHECKER: CSSProperties = {
  backgroundColor: "#FFFFFF",
  backgroundImage: "repeating-conic-gradient(#E6E6E6 0% 25%, #FFFFFF 0% 50%)",
  backgroundSize: "10px 10px",
  backgroundPosition: "center",
  border: "1px solid #B8BCC8",
}

const LABEL: CSSProperties = {
  position: "absolute",
  insetInlineStart: 4,
  top: 4,
  fontSize: 10,
  lineHeight: "14px",
  color: "#334155",
  background: "rgba(255,255,255,0.9)",
  padding: "0 5px",
  borderRadius: 3,
  whiteSpace: "nowrap",
  pointerEvents: "none",
}

/** Grey lines standing in for text, in the box's columns. */
function TextLines({ columns }: { columns: number }) {
  return (
    <div style={{ position: "absolute", inset: "22px 6px 6px", display: "flex", gap: 8 }}>
      {Array.from({ length: columns }, (_, index) => (
        <div
          key={index}
          style={{
            flex: 1,
            backgroundImage: "repeating-linear-gradient(to bottom, #D7DAE5 0 3px, transparent 3px 9px)",
          }}
        />
      ))}
    </div>
  )
}

/** Small tiles standing in for the figures a spot holds. */
function FigureTiles({ holds, colour }: { holds: number; colour: string }) {
  const shown = Math.min(holds, 6)
  return (
    <div
      style={{
        position: "absolute",
        inset: "22px 6px 6px",
        display: "grid",
        gridTemplateColumns: `repeat(${shown > 3 ? 2 : 1}, 1fr)`,
        gap: 4,
      }}
    >
      {Array.from({ length: shown }, (_, index) => (
        <div key={index} style={{ border: `1px solid ${colour}`, borderRadius: 3, padding: 3, minHeight: 0 }}>
          <div style={{ height: 5, width: "60%", background: colour, borderRadius: 1 }} />
          <div style={{ height: 2, width: "80%", background: "#D7DAE5", marginTop: 3 }} />
        </div>
      ))}
    </div>
  )
}

/** One box: its shape (clipped) and its label (never clipped). */
function SketchBoxView({
  box,
  facts,
  rtl,
  layer,
}: {
  box: SketchBox
  facts: SheetFacts
  rtl: boolean
  /** Its place in the painting order (higher = nearer the front). */
  layer: number
}) {
  const position: CSSProperties = {
    position: "absolute",
    insetInlineStart: `${box.x}%`,
    top: `${box.y}%`,
    width: `${box.w}%`,
    height: `${box.h}%`,
    zIndex: layer,
  }
  const brand = facts.colours.brand
  let fill: CSSProperties
  if (box.role === "colour") {
    const colour = box.colour === "second" ? facts.colours.second : box.colour === "light" ? facts.colours.light : brand
    fill = { background: colour }
  } else if (box.role === "image") {
    fill = CHECKER
  } else if (box.role === "text") {
    // See-through, so a picture set as the page's background shows behind it.
    fill = { background: "rgba(248, 250, 252, 0.72)", border: "1px solid #E2E8F0" }
  } else {
    fill = { background: "rgba(255, 255, 255, 0.8)", border: `1.5px dashed ${brand}` }
  }
  const label = boxLabel(box)
  return (
    <div style={position}>
      <div style={{ position: "absolute", inset: 0, ...fill, ...shapeStyle(box.shape, rtl) }} />
      {box.role === "text" && <TextLines columns={box.columns} />}
      {box.role === "figures" && <FigureTiles holds={box.holds} colour={brand} />}
      {box.role === "quotes" && (
        <div
          aria-hidden
          style={{ position: "absolute", insetInlineStart: 8, top: 18, fontSize: 30, lineHeight: 1, color: brand }}
        >
          &ldquo;
        </div>
      )}
      {label && <span style={LABEL}>{label}</span>}
    </div>
  )
}

/** The end page: it flows, so it has no boxes, only a schematic of tables. */
function EndPage({ facts }: { facts: SheetFacts }) {
  const rows = Array.from({ length: 7 }, (_, index) => index)
  return (
    <div style={{ position: "absolute", inset: "14% 12%", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ height: 8, width: "45%", background: "#94A3B8", borderRadius: 2 }} />
      <div style={{ height: 12, background: facts.colours.brand, borderRadius: 2 }} />
      {rows.map((row) => (
        <div key={row} style={{ height: 8, background: row % 2 ? "#F1F5F9" : "#E2E8F0", borderRadius: 1 }} />
      ))}
      <span style={{ ...LABEL, position: "static", alignSelf: "flex-start", marginTop: 8 }}>
        Tables, then any figures or quotes the pages could not hold
      </span>
    </div>
  )
}

export const CustomSketchDrawing = memo(function CustomSketchDrawing({
  layout,
  facts,
  rtl,
}: {
  layout: SketchLayout
  facts: SheetFacts
  /** Draw it right to left (an Arabic report): positions mirror, and so does a slanted shape. */
  rtl: boolean
}) {
  const [width, height] = facts.page_pt
  // The running header and footer strips, faintly, so it is clear why boxes stop short.
  const strip = `${(facts.safe_inset_pt / height) * 100}%`
  const boxes = [...layout.boxes].sort((a, b) => LAYER[a.role] - LAYER[b.role])
  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      role="img"
      aria-label={layout.summary || "Layout sketch"}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${width} / ${height}`,
        background: "#FFFFFF",
        border: "1px solid #CBD5E1",
        borderRadius: 4,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
      }}
    >
      <div style={{ position: "absolute", insetInline: 0, top: 0, height: strip, background: "#F8FAFC", borderBottom: "1px dashed #E2E8F0" }} />
      <div style={{ position: "absolute", insetInline: 0, bottom: 0, height: strip, background: "#F8FAFC", borderTop: "1px dashed #E2E8F0" }} />
      {layout.kind === "end" ? (
        <EndPage facts={facts} />
      ) : (
        boxes.map((box, index) => <SketchBoxView key={index} box={box} facts={facts} rtl={rtl} layer={index + 1} />)
      )}
    </div>
  )
})
