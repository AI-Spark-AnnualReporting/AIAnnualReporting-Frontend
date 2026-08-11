"use client"

import { useState } from "react"
import { Loader2, Send } from "lucide-react"

/**
 * The compact per-card "Refine with AI" instruction box (input + send).
 * Shared by the areas-of-focus and concept-message cards; the review page's
 * larger RefinePanel adds quick-instruction chips on top of the same idea.
 *
 * `onSubmit` resolves true to clear the input — false leaves the instruction in
 * place so a failed or unwired refine doesn't look like it was applied.
 */
export function InlineRefineBox({
  onSubmit,
  placeholder,
  isRtl,
}: {
  onSubmit: (instruction: string) => Promise<boolean>
  placeholder: string
  isRtl?: boolean
}) {
  const [instruction, setInstruction] = useState("")
  const [refining, setRefining] = useState(false)

  const submit = async () => {
    const value = instruction.trim()
    if (!value || refining) return
    setRefining(true)
    try {
      if (await onSubmit(value)) setInstruction("")
    } finally {
      setRefining(false)
    }
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <input
        type="text"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            submit()
          }
        }}
        disabled={refining}
        placeholder={placeholder}
        dir={isRtl ? "rtl" : "ltr"}
        className="min-w-0 flex-1 rounded-full border border-indigo-200 bg-white px-3.5 py-2 text-xs outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-indigo-400 disabled:opacity-60"
      />
      <button
        type="button"
        onClick={submit}
        disabled={refining || !instruction.trim()}
        aria-label="Send instruction"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:bg-indigo-300"
      >
        {refining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}
