"use client"

import { useContext, useState } from "react"
import { Loader2, MessageSquareText, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { FixPrefillContext } from "@/lib/validation-fixes"

interface SectionChatProps {
  refining: boolean
  onRefine: (instruction: string) => void
  /** This box's section. When the PM arrived from a validation finding for it,
   *  the box starts with that finding's instruction - sent only on their click. */
  sectionCode?: string
}

const SUGGESTED_CHIPS = [
  "Make it concise",
  "More formal tone",
  "Expand detail",
] as const

export function SectionChat({ refining, onRefine, sectionCode }: SectionChatProps) {
  const prefill = useContext(FixPrefillContext)
  const [instruction, setInstruction] = useState(() =>
    prefill && prefill.sectionCode === sectionCode ? prefill.text : "",
  )
  const [turns, setTurns] = useState<{ instruction: string }[]>([])

  const trimmed = instruction.trim()
  const disabled = refining || !trimmed

  const send = () => {
    if (disabled) return
    setTurns((prev) => [...prev, { instruction: trimmed }])
    onRefine(trimmed)
    setInstruction("")
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const showChips = turns.length === 0 && instruction.length === 0

  return (
    <div className="space-y-3">
      {turns.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Previous instructions
          </p>
          <ul className="space-y-1">
            {turns.map((t, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <MessageSquareText className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground/60" />
                <span className="leading-relaxed">{t.instruction}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showChips && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">Try:</span>
          {SUGGESTED_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setInstruction(chip)}
              className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <Textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Try: 'make this more concise' or 'add the cost-reduction figure'"
          disabled={refining}
          // Grows to fit, so a Fix button's long instruction shows in full.
          // field-sizing is Chrome/Edge only; elsewhere it stays 2 rows.
          className="max-h-48 resize-none rounded-xl [field-sizing:content]"
        />
        <Button
          onClick={send}
          disabled={disabled}
          className="bg-indigo-600 text-white hover:bg-indigo-700"
          title={
            !trimmed
              ? "Type an instruction first"
              : refining
                ? "Refining…"
                : "Send (Enter)"
          }
        >
          {refining ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Send className="h-4 w-4 mr-1.5" />
              Send
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
