"use client"

import { useState } from "react"
import { Eye, Pencil, Sparkles, Star, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ProsePreview } from "@/components/ui/prose-preview"
import { InlineRefineBox } from "@/components/report/InlineRefineBox"
import { cn } from "@/lib/utils"

/**
 * A concept message: the brand copy behind one area of focus. Title and
 * description are the PM's to edit; the message carries nothing else, so the
 * primary one is simply whichever sits first in the list.
 *
 * The description is first-person marketing copy, up to a couple of paragraphs
 * split by a blank line — so it gets the Strategic Brief's Edit/Preview
 * treatment (textarea in, rendered paragraphs out) rather than ThemeChipCard's
 * short chips.
 */
export function ConceptMessageCard({
  index,
  title,
  description,
  isPrimary,
  primaryGroup,
  isRtl,
  disabled,
  onTitleChange,
  onDescriptionChange,
  onMakePrimary,
  onRemove,
  onRefine,
}: {
  index: number
  title: string
  /** First-person brand copy; may hold two paragraphs split by a blank line. */
  description: string
  /** True for the message at the top of the list. A concept message carries no
   *  role of its own, so position is what marks the primary one. */
  isPrimary: boolean
  /** Shared radio name so only one message can be primary. */
  primaryGroup: string
  isRtl?: boolean
  /** An AI call is in flight — freeze the controls to prevent double-submit. */
  disabled?: boolean
  onTitleChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  /** Promotes this message's area to primary (and demotes the previous one). */
  onMakePrimary: () => void
  onRemove: () => void
  /** Resolve true to clear the instruction box. */
  onRefine: (instruction: string) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [refineOpen, setRefineOpen] = useState(false)

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-colors",
        isPrimary
          ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-300"
          : "border-indigo-100 bg-indigo-50/40",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-xs font-semibold text-indigo-600">
          {index + 1}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {/* Title follows the Edit toggle: a heading while previewing, a
                  real bordered field once editing. A borderless always-on input
                  looked like static text, so nobody knew it could be changed. */}
              {editing ? (
                <div className="space-y-1">
                  <label
                    htmlFor={`concept-title-${index}`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Title
                  </label>
                  <Input
                    id={`concept-title-${index}`}
                    value={title}
                    onChange={(e) => onTitleChange(e.target.value)}
                    disabled={disabled}
                    placeholder="Message title…"
                    dir={isRtl ? "rtl" : "ltr"}
                    className={cn(
                      "h-9 bg-white text-base font-bold text-indigo-700",
                      isRtl && "text-right",
                    )}
                  />
                </div>
              ) : (
                <h4
                  dir={isRtl ? "rtl" : "ltr"}
                  className={cn(
                    "text-base font-bold text-indigo-700",
                    isRtl && "text-right",
                  )}
                >
                  {title.trim() || (
                    <span className="font-normal italic text-muted-foreground">Untitled message</span>
                  )}
                </h4>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                {/* Position marks the primary, so picking this moves the card
                    to the top of the list. */}
                <label
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium",
                    isPrimary ? "text-indigo-700" : "text-muted-foreground",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <input
                    type="radio"
                    name={primaryGroup}
                    checked={isPrimary}
                    disabled={disabled}
                    onChange={onMakePrimary}
                    className="h-3.5 w-3.5 cursor-pointer accent-indigo-600"
                  />
                  <Star
                    className={cn(
                      "h-3 w-3",
                      isPrimary ? "fill-indigo-600 text-indigo-600" : "text-muted-foreground",
                    )}
                  />
                  Primary
                </label>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => setEditing((e) => !e)}
              >
                {editing ? (
                  <><Eye className="h-3.5 w-3.5" /> Preview</>
                ) : (
                  <><Pencil className="h-3.5 w-3.5" /> Edit</>
                )}
              </Button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setRefineOpen((o) => !o)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-100 disabled:opacity-50",
                  refineOpen && "bg-indigo-100 ring-1 ring-indigo-300",
                )}
              >
                <Sparkles className="h-3.5 w-3.5" /> Refine with AI
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={onRemove}
                aria-label="Remove concept message"
                className="text-muted-foreground/40 transition-colors hover:text-destructive disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {editing ? (
            <div className="mt-3 space-y-1">
              <label
                htmlFor={`concept-description-${index}`}
                className="text-xs font-medium text-muted-foreground"
              >
                Description
              </label>
              <Textarea
                id={`concept-description-${index}`}
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                disabled={disabled}
                placeholder="Brand copy in the company's voice — leave a blank line between paragraphs."
                rows={8}
                dir={isRtl ? "rtl" : "ltr"}
                className="bg-white text-sm leading-relaxed"
              />
            </div>
          ) : (
            <div className="mt-3 rounded-lg border bg-white p-4">
              {description.trim() ? (
                // Blank-line-separated paragraphs render as separate <p>s.
                <ProsePreview content={description} className="prose-indigo" />
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  No description yet — hit Edit to write it, or Refine with AI.
                </p>
              )}
            </div>
          )}

          {refineOpen && (
            <InlineRefineBox
              onSubmit={onRefine}
              isRtl={isRtl}
              placeholder="e.g. make it punchier, lead with the outcome, shorten to one paragraph…"
            />
          )}
        </div>
      </div>
    </div>
  )
}
