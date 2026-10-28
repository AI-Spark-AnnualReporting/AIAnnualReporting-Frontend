"use client"

import { createContext, createElement, useContext } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeRaw from "rehype-raw"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"
import { cn } from "@/lib/utils"
import { normalizeMarkdownTables } from "@/lib/report-format"
import { headingAnchorId } from "@/lib/sectionOutline"
import { rehypeChangeMarks } from "@/lib/undo-diff"

/** The default schema drops `class` and `style`, which would flatten every
 *  assembled report rendered through here — the report builder's HTML carries
 *  both. They are added back deliberately: the vectors that actually execute
 *  are script elements, `on*` handlers and `javascript:` URLs, and the schema
 *  still removes all three. Presentation survives; code does not. */
const SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className", "style"],
  },
}

interface ProsePreviewProps {
  content: string
  className?: string
  // When "rtl", the whole markdown block lays out right-to-left so its headings
  // and lists right-align — used for Arabic report content. Defaults to "auto",
  // which lets the browser pick per content when the caller has no cycle
  // language to hand.
  dir?: "ltr" | "rtl" | "auto"
  /** The content carries markChanges' marks (the Undo pop-up): show them as
   *  green / red-crossed-out text. */
  changeMarks?: boolean
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

/** Text to highlight in every preview below it. Only the Build page provides
 *  one (the open section's validation findings); everywhere else it is null
 *  and previews render exactly as before. */
export const ProseHighlightContext = createContext<RegExp | null>(null)

// Minimal hast shapes - just what the highlighter walks.
type HastText = { type: "text"; value: string }
type HastNode = { type: string; value?: string; children?: HastNode[] }

/** Split one text node's value into plain text and <mark> pieces. */
function splitOnMatches(value: string, pattern: RegExp): HastNode[] {
  const pieces: HastNode[] = []
  let last = 0
  for (const match of value.matchAll(pattern)) {
    const start = match.index ?? 0
    if (!match[0]) continue
    if (start > last) pieces.push({ type: "text", value: value.slice(last, start) } as HastText)
    pieces.push({
      type: "element",
      tagName: "mark",
      properties: { className: ["rounded", "bg-amber-200", "px-0.5", "text-inherit"] },
      children: [{ type: "text", value: match[0] } as HastText],
    } as HastNode)
    last = start + match[0].length
  }
  if (pieces.length === 0) return [{ type: "text", value } as HastText]
  if (last < value.length) pieces.push({ type: "text", value: value.slice(last) } as HastText)
  return pieces
}

/** Wrap matches in every text node under `node`, in place. */
function highlightTree(node: HastNode, pattern: RegExp): void {
  if (!node.children) return
  const next: HastNode[] = []
  for (const child of node.children) {
    if (child.type === "text") {
      next.push(...splitOnMatches(child.value ?? "", pattern))
    } else {
      highlightTree(child, pattern)
      next.push(child)
    }
  }
  node.children = next
}

/* A rehype step that marks matches AFTER sanitizing. Adding <mark> tags to the
 * markdown instead would need the sanitizer to allow them, and could land
 * inside markdown syntax (a link, a table cell's pipes). Touching only text
 * nodes cannot break either. */
function rehypeHighlight(options: { pattern: RegExp }) {
  return (tree: HastNode) => highlightTree(tree, options.pattern)
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

export function ProsePreview({
  content,
  className,
  dir = "auto",
  changeMarks = false,
}: ProsePreviewProps) {
  const trimmed = content.trim()
  const looksLikeHtml = HTML_RE.test(trimmed.slice(0, 200))
  const style = dir === "rtl" ? { textAlign: "right" as const } : undefined
  const highlight = useContext(ProseHighlightContext)
  return looksLikeHtml ? (
    // Through the SAME pipeline as the markdown branch, not
    // dangerouslySetInnerHTML. rehypeRaw materialises the HTML and
    // rehypeSanitize strips anything executable from it.
    //
    // This used to inject the string unchecked, which was safe only while
    // every caller fed it our own AI's output. That stopped being true when
    // the client sign-off let an outside party write the strategic brief:
    // Spark's review screen renders that brief here, so a brief beginning
    // with a tag would have run as script in a spark_internal session — the
    // one account that can reach every company's cycles.
    //
    // normalizeMarkdownTables is deliberately NOT applied: it inserts GFM
    // delimiter rows for pipe tables, which HTML content has no use for.
    <div dir={dir} style={style} className={cn("prose prose-sm max-w-none", className)}>
      <ReactMarkdown rehypePlugins={[rehypeRaw, [rehypeSanitize, SCHEMA]]}>
        {content}
      </ReactMarkdown>
    </div>
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
            rehypePlugins={
              changeMarks
                ? [rehypeRaw, [rehypeSanitize, SCHEMA], rehypeChangeMarks]
                : highlight
                  ? [rehypeRaw, [rehypeSanitize, SCHEMA], [rehypeHighlight, { pattern: highlight }]]
                  : [rehypeRaw, [rehypeSanitize, SCHEMA]]
            }
            components={makeHeadingRenderer(md)}
          >
            {md}
          </ReactMarkdown>
        </div>
      )
    })()
  )
}
