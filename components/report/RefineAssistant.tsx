"use client"

import { useState } from "react"
import { Loader2, Send, Sparkles } from "lucide-react"

/**
 * "Refine with AI" assistant — quick-instruction chips + a free-text box.
 * Extracted from the Strategic Brief review page's RefinePanel so brief-style
 * theme editors can share it. `onSubmit` returns true on success so the input
 * clears; false leaves the text intact.
 */
export function RefineAssistant({
  chips,
  loading,
  onSubmit,
  placeholder,
}: {
  chips: string[]
  loading: boolean
  onSubmit: (instruction: string) => Promise<boolean>
  placeholder: string
}) {
  const [text, setText] = useState("")

  const submit = async (instruction: string) => {
    const value = instruction.trim()
    if (!value || loading) return
    const ok = await onSubmit(value)
    if (ok) setText("")
  }

  return (
    <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <Sparkles className="h-4 w-4" />
        </span>
        <p className="text-sm">
          <span className="font-semibold text-indigo-700">AI assistant</span>
          <span className="text-muted-foreground"> — describe a change and it updates above</span>
        </p>
      </div>

      {/* Quick-instruction chips */}
      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={loading}
            onClick={() => submit(chip)}
            className="rounded-full border border-indigo-200 bg-white px-3.5 py-2 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-50 disabled:opacity-50"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Free-text instruction + circular send */}
      <div className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              submit(text)
            }
          }}
          disabled={loading}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-full border border-indigo-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-indigo-400 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => submit(text)}
          disabled={loading || !text.trim()}
          aria-label="Send instruction"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:bg-indigo-300"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
