"use client"

import ReactMarkdown from "react-markdown"
import { cn } from "@/lib/utils"

interface ProsePreviewProps {
  content: string
  className?: string
}

// Crude detector — same pattern as the dept draft + PM session pages. If the
// content starts with something HTML-looking, render it raw; otherwise treat
// it as markdown. The peek at the first 200 chars keeps this cheap.
const HTML_RE = /<[a-z][\s\S]*>/i

export function ProsePreview({ content, className }: ProsePreviewProps) {
  const trimmed = content.trim()
  const looksLikeHtml = HTML_RE.test(trimmed.slice(0, 200))
  return looksLikeHtml ? (
    <div
      className={cn("prose prose-sm max-w-none", className)}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  ) : (
    <div className={cn("prose prose-sm max-w-none", className)}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  )
}
