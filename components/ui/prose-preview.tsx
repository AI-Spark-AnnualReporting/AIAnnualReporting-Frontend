"use client"

import { createElement } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
import rehypeSanitize from "rehype-sanitize"
import { cn } from "@/lib/utils"

interface ProsePreviewProps {
  content: string
  className?: string
  // When "rtl", the whole markdown block lays out right-to-left so its headings
  // and lists right-align — used for Arabic report content.
  dir?: "ltr" | "rtl"
}

// Crude detector — same pattern as the dept draft + PM session pages. If the
// content starts with something HTML-looking, render it raw; otherwise treat
// it as markdown. The peek at the first 200 chars keeps this cheap.
const HTML_RE = /<[a-z][\s\S]*>/i

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
    return createElement(`h${clamped}`, null, children)
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

export function ProsePreview({ content, className, dir }: ProsePreviewProps) {
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
    <div dir={dir} style={style} className={cn("prose prose-sm max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // rehypeRaw turns raw HTML (e.g. <br> the AI stacks inside table cells)
        // into real elements; rehypeSanitize then strips anything unsafe so only
        // benign markup survives. Order matters: raw must run before sanitize.
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={makeHeadingRenderer(content)}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
