"use client"

import { useState } from "react"
import { Loader2, MessageSquareText, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface SectionChatProps {
  refining: boolean
  onRefine: (instruction: string) => void
}

const SUGGESTED_CHIPS = [
  "Make it concise",
  "More formal tone",
  "Expand detail",
] as const

export function SectionChat({ refining, onRefine }: SectionChatProps) {
  const [instruction, setInstruction] = useState("")
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
          <span className="text-xs text-muted-foreground">Try:</span>
          {SUGGESTED_CHIPS.map((chip) => (
            <Button
              key={chip}
              size="sm"
              variant="outline"
              onClick={() => setInstruction(chip)}
              className="h-7 text-xs font-normal"
            >
              {chip}
            </Button>
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
          className="resize-none"
        />
        <Button
          onClick={send}
          disabled={disabled}
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
