"use client"

import { coverVariant } from "@/types/report-design"

/**
 * The schematic thumbnail on a layout tile.
 *
 * A transcription of Centrion_Frontend/src/components/quarterly/
 * CoverTemplatePicker.tsx:69-110, so the tile row reads the same in both apps.
 *
 * It draws bars, not a document. The tiles used to render three live, scaled
 * CoverPreviews — truer, but three 595x842 subtrees and three ResizeObservers
 * to show something 190px wide. The one thing worth keeping from that is the
 * re-tint: `accent` is the live brand primary, so picking a palette still
 * repaints all three tiles.
 *
 * Radii are inline numbers rather than Tailwind classes, which is what makes
 * this file safe to copy across: `rounded-md` is 8px in Centrion and 6px here.
 */
export function MiniCover({ templateKey, accent }: { templateKey: string; accent: string }) {
  const variant = coverVariant(templateKey)

  const shell: React.CSSProperties = {
    width: "100%",
    aspectRatio: "1 / 1.3",
    borderRadius: 6,
    background: "#fff",
    border: "1px solid #E5E7EF",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  }

  const line = (w: string, c = "#E4E6F1") => (
    <div style={{ height: 4, width: w, borderRadius: 3, background: c }} />
  )

  if (variant === "bold") {
    return (
      <div style={shell}>
        <div style={{ background: accent, padding: "10px 10px", display: "flex",
                      flexDirection: "column", gap: 4 }}>
          <div style={{ height: 6, width: "70%", borderRadius: 3, background: "rgba(255,255,255,.9)" }} />
          <div style={{ height: 4, width: "45%", borderRadius: 3, background: "rgba(255,255,255,.6)" }} />
        </div>
        <div style={{ flex: 1, padding: 10, display: "flex", flexDirection: "column",
                      gap: 4, justifyContent: "flex-end" }}>
          {line("60%")}
          {line("40%")}
        </div>
      </div>
    )
  }

  if (variant === "minimal") {
    return (
      <div style={{ ...shell, padding: 10, justifyContent: "center", gap: 6 }}>
        <div style={{ height: 3, width: 20, borderRadius: 3, background: accent }} />
        <div style={{ height: 6, width: "65%", borderRadius: 3, background: "#1A1D2E" }} />
        {line("40%")}
      </div>
    )
  }

  return (
    <div style={{ ...shell, padding: 10, gap: 6 }}>
      <div style={{ height: 4, width: 32, borderRadius: 3, background: accent }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4,
                    justifyContent: "center" }}>
        <div style={{ height: 6, width: "70%", borderRadius: 3, background: "#1A1D2E" }} />
        {line("45%")}
      </div>
      <div style={{ height: 2, width: "100%", background: accent, borderRadius: 3 }} />
    </div>
  )
}
