"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeletons"
import { ProsePreview } from "@/components/ui/prose-preview"
import { RoleToggle } from "@/components/report/RoleToggle"
import { InlineRefineBox } from "@/components/report/InlineRefineBox"
import type { AreaOfFocus, AreaRole } from "@/lib/areasOfFocus"
import type { ConceptMessage } from "@/lib/api/pm"
import { cn } from "@/lib/utils"
import {
  Check, MessageSquareQuote, Pencil, Sparkles, Target, Trash2,
} from "lucide-react"

/* ────────────────────────────────────────────────────────────────────────────
   One area of focus with its concept message inside it.

   The two used to be separate lists on separate screens, which meant reading
   "area 2" in one place and "message 2" in another and trusting they lined up.
   Nothing on screen said they did — a concept message has no stored reference
   to its area, only its position — so the pairing was invisible exactly where
   it mattered most, to the client being asked to approve it.

   Position IS the link: message N belongs to area N. Rendering them as one card
   makes that structural rather than something the reader has to reconstruct.

   The primary/secondary mark lives here too, because the choice is about the
   pair, not about either half on its own. Setting it must update BOTH the area
   and its message — see onRoleChange in the callers.
──────────────────────────────────────────────────────────────────────────── */

export function AreaConceptCard({
  index,
  area,
  message,
  messageLoading = false,
  roleGroup,
  readOnly = false,
  lockRole = false,
  onAreaChange,
  onMessageChange,
  onRoleChange,
  onRemove,
  onRefine,
}: {
  index: number
  area: AreaOfFocus
  /** Undefined while the messages are still being written. */
  message?: ConceptMessage
  /** The messages are still on their way. Not the same as "none written":
   *  without this the card says "No concept message yet" while the real one
   *  is in flight, which reads as lost work. */
  messageLoading?: boolean
  /** Shared across the list so the primary radios are mutually exclusive. */
  roleGroup: string
  readOnly?: boolean
  /** Show the primary/secondary mark but don't let this reader set it. Spark
   *  sees the client's choice; the client is the one who makes it. */
  lockRole?: boolean
  onAreaChange: (next: Partial<AreaOfFocus>) => void
  onMessageChange: (next: Partial<ConceptMessage>) => void
  onRoleChange: (role: AreaRole) => void
  onRemove?: () => void
  /** One instruction, both halves of the card: the area's slogan AND its
   *  concept message. They say the same thing in two lengths, so refining one
   *  alone left the other describing something else.
   *  Omitted on the client's link — an unauthenticated page must not be able
   *  to spend OpenAI budget. Absent means no button at all, not a dead one. */
  onRefine?: (instruction: string) => Promise<boolean>
}) {
  // A card someone just added arrives with an empty message and nothing to
  // read, so it opens ready to write instead of behind an Edit click. A message
  // that is merely still loading is undefined, not empty, which is what keeps
  // every card on the page from springing open while the messages arrive.
  const [editing, setEditing] = useState(
    () =>
      !readOnly &&
      !!message &&
      !message.title?.trim() &&
      !message.description?.trim(),
  )
  const [refineOpen, setRefineOpen] = useState(false)
  const canRefine = !!onRefine && !readOnly
  const role = area.role ?? "none"
  const used = role !== "none"

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-5 shadow-sm transition-colors",
        role === "primary"
          ? "border-indigo-400 ring-1 ring-indigo-200"
          : used
            ? "border-indigo-200"
            : "border-border",
      )}
    >
      {/* ── The area ──
          Named, because the card holds two different things and a reader
          otherwise has to infer which is which from the styling alone. */}
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            used ? "bg-indigo-600 text-white" : "bg-muted text-muted-foreground",
          )}
        >
          {index + 1}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700">
            <Target className="h-3.5 w-3.5" />
            Area of focus
          </div>

          {readOnly ? (
            <p className="mt-1 text-lg font-bold leading-snug text-foreground">
              {area.slogan}
            </p>
          ) : (
            // A real bordered field. Borderless looked like a heading, so
            // nobody discovered it could be typed in.
            <input
              type="text"
              value={area.slogan}
              onChange={(e) => onAreaChange({ slogan: e.target.value })}
              placeholder="Name this area of focus"
              aria-label={`Area of focus ${index + 1}`}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-lg font-bold leading-snug text-foreground outline-none transition-colors hover:border-indigo-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 placeholder:font-normal placeholder:text-muted-foreground/60"
            />
          )}

          {area.summary && (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {area.summary}
            </p>
          )}
        </div>

        {canRefine && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setRefineOpen((o) => !o)}
            title="Refine this area and its concept message together"
            className={cn(
              "h-7 shrink-0 px-2 text-xs text-indigo-600",
              refineOpen && "bg-indigo-100 ring-1 ring-indigo-300",
            )}
          >
            <Sparkles className="h-3.5 w-3.5" /> Refine
          </Button>
        )}

        {!readOnly && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            title="Remove this area and its message"
            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── Its concept message ──
          Indented under the area and held by a left rule: the message BELONGS
          to the area above it, and two stacked boxes of equal weight read as
          two separate things rather than one inside the other. */}
      <div className="ms-10 mt-4 border-s-2 border-indigo-200 ps-4">
        <div className="rounded-xl border border-border/70 bg-muted/40 p-4">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <MessageSquareQuote className="h-3.5 w-3.5" />
          Concept message for this area
        </div>
        {messageLoading ? (
          // Shaped like what is coming: a short title bar, then three lines
          // of body, so the card does not jump when the real text lands.
          <div aria-busy="true" aria-label="Loading concept message" className="space-y-2.5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-[94%]" />
            <Skeleton className="h-3.5 w-[72%]" />
          </div>
        ) : (
        <>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {readOnly || !editing ? (
              <p className="text-base font-bold text-indigo-700">
                {message?.title || "No concept message yet"}
              </p>
            ) : (
              <input
                type="text"
                value={message?.title ?? ""}
                onChange={(e) => onMessageChange({ title: e.target.value })}
                placeholder="Two-word title"
                aria-label={`Concept message title for area ${index + 1}`}
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-base font-bold text-indigo-700 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            )}
          </div>

          {!readOnly && message && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing((e) => !e)}
              className="h-7 shrink-0 px-2 text-xs"
            >
              {editing ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Done
                </>
              ) : (
                <>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </>
              )}
            </Button>
          )}
        </div>

        <div className="mt-2">
          {!readOnly && editing ? (
            <Textarea
              value={message?.description ?? ""}
              onChange={(e) => onMessageChange({ description: e.target.value })}
              rows={10}
              placeholder="Three paragraphs, separated by blank lines…"
              className="text-sm"
            />
          ) : message?.description?.trim() ? (
            // Blank-line-separated paragraphs render as separate <p>s.
            <ProsePreview content={message.description} className="prose-indigo" />
          ) : (
            <p className="text-sm italic text-muted-foreground">
              {readOnly
                ? "No concept message was written for this area."
                : "Nothing written yet — hit Edit to write it."}
            </p>
          )}
        </div>
        </>
        )}

        </div>
      </div>

      {/* Outside the message's indent rule: this box rewrites BOTH halves of
          the card, so sitting under the message alone misreads as belonging
          to it. */}
      {refineOpen && onRefine && (
        <div className="ms-10 mt-3">
          <InlineRefineBox
            onSubmit={onRefine}
            placeholder="e.g. make it punchier, lead with the outcome, sharpen the area name…"
          />
        </div>
      )}

      {/* ── The choice this pair is here for ── */}
      <div className="ms-10 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3">
        <p className="text-xs text-muted-foreground">
          {role === "primary"
            ? "Leads the report."
            : role === "secondary"
              ? "Used in the report."
              : "Not used in the report."}
        </p>
        {readOnly || lockRole ? (
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-semibold",
              role === "primary"
                ? "bg-indigo-100 text-indigo-700"
                : role === "secondary"
                  ? "bg-muted text-foreground"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {role === "primary" ? "Primary" : role === "secondary" ? "Secondary" : "Not used"}
          </span>
        ) : (
          <RoleToggle role={role} group={roleGroup} onChange={onRoleChange} />
        )}
      </div>
    </div>
  )
}
