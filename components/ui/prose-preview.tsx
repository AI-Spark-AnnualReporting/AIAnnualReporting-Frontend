"use client"

import { createElement } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
import rehypeSanitize from "rehype-sanitize"
import { cn } from "@/lib/utils"
import { normalizeMarkdownTables } from "@/lib/report-format"
import { headingAnchorId } from "@/lib/sectionOutline"

interface ProsePreviewProps {
  content: string
  className?: string
  // When "rtl", the whole markdown block lays out right-to-left so its headings
  // and lists right-align — used for Arabic report content. Defaults to "auto",
  // which lets the browser pick per content when the caller has no cycle
  // language to hand.
  dir?: "ltr" | "rtl" | "auto"
}

// Crude detector — same pattern as the dept draft + PM session pages. If the
// content starts with something HTML-looking, render it raw; otherwise treat
// it as markdown. The peek at the first 200 chars keeps this cheap.
const HTML_RE = /<[a-z][\s\S]*>/i

// A heading's own text, for the anchor id. react-markdown hands the renderer
// React children rather than the raw string — a heading carrying emphasis or a
// link arrives as nested elements, so it has to be walked rather than cast.
function flattenText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join("")
  if (node && typeof node === "object" && "props" in node) {
    const props = (node as { props?: { children?: React.ReactNode } }).props
    return flattenText(props?.children)
  }
  return ""
}

// Build a heading-demotion renderer for the given content. The shallowest
// heading the author used is mapped to <h3> so section content never out-sizes
// the section title above it; deeper headings step down from there (capped at
// <h6>). Recomputed per render because `base` depends on the content.
function makeHeadingRenderer(content: string): Components {
  const found = [...content.matchAll(/^(#{1,6})\s+/gm)].map((m) => m[1].length)
  const base = found.length ? Math.min(...found) : 1

  const HeadingRenderer: Components["h1"] = ({ node, children }) => {
    const mdLevel = Number(node?.tagName.slice(1) ?? 1) // "h1" -> 1
    const clamped = Math.min(Math.max(3 + (mdLevel - base), 3), 6)
    // An id derived from the heading text, so the builder's rail can scroll to
    // a subsection. Same slug on both sides — see headingAnchorId.
    const id = headingAnchorId(flattenText(children))
    // The demoted h3 is where a section's own subheadings land, and the `prose`
    // cascade only gives it weight 600 — barely distinguishable from the bold
    // runs inside the paragraphs beneath it. Bold it so a subheading still
    // reads as one. Deeper levels keep the cascade's own steps.
    return createElement(
      `h${clamped}`,
      clamped === 3 ? { id, className: "font-bold" } : { id },
      children,
    )
  }

  return {
    h1: HeadingRenderer,
    h2: HeadingRenderer,
    h3: HeadingRenderer,
    h4: HeadingRenderer,
    h5: HeadingRenderer,
    h6: HeadingRenderer,
  }
}

export function ProsePreview({ content, className, dir = "auto" }: ProsePreviewProps) {
  const trimmed = content.trim()
  const looksLikeHtml = HTML_RE.test(trimmed.slice(0, 200))
  const style = dir === "rtl" ? { textAlign: "right" as const } : undefined
  return looksLikeHtml ? (
    <div
      dir={dir}
      style={style}
      className={cn("prose prose-sm max-w-none", className)}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  ) : (
    (() => {
      // Insert the GFM delimiter row the AI omits so pipe tables render as
      // tables instead of a run of literal "|" text.
      const md = normalizeMarkdownTables(content)
      return (
        <div dir={dir} style={style} className={cn("prose prose-sm max-w-none", className)}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            // rehypeRaw turns raw HTML (e.g. <br> the AI stacks inside table cells)
            // into real elements; rehypeSanitize then strips anything unsafe so only
            // benign markup survives. Order matters: raw must run before sanitize.
            rehypePlugins={[rehypeRaw, rehypeSanitize]}
            components={makeHeadingRenderer(md)}
          >
            {md}
          </ReactMarkdown>
        </div>
      )
    })()
  )
}
