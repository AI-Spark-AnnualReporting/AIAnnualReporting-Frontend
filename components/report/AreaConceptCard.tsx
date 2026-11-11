"use client"

import { useRef, useState } from "react"
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
  groupedMessages,
  onGroupedMessageChange,
  onGroupedRoleChange,
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
  /** New cycles (3 messages per area): this area's messages, each with its
   *  position in the full list. When given, the card shows all of them, each
   *  with its own Primary/Secondary pick, and `message` is ignored. */
  groupedMessages?: { message: ConceptMessage; position: number }[]
  /** Edit one of the grouped messages, by its position in the full list. */
  onGroupedMessageChange?: (position: number, next: Partial<ConceptMessage>) => void
  /** Set one grouped message's role within this area. */
  onGroupedRoleChange?: (position: number, role: AreaRole) => void
  /** One instruction, both halves of the card: the area's slogan AND its
   *  concept message. They say the same thing in two lengths, so refining one
   *  alone left the other describing something else.
   *  Omitted on the client's link — an unauthenticated page must not be able
   *  to spend OpenAI budget. Absent means no button at all, not a dead one. */
  onRefine?: (instruction: string) => Promise<boolean>
}) {
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

      {/* ── Its concept message(s) ──
          Indented under the area and held by a left rule: the messages BELONG
          to the area above them. */}
      <div className="ms-10 mt-4 space-y-3 border-s-2 border-indigo-200 ps-4">
        {groupedMessages ? (
          <>
            <p className="text-xs text-muted-foreground">
              {readOnly &&
              groupedMessages.every(({ message: m }) => (m.role ?? "none") !== "none")
                ? "The concept messages used for this area."
                : readOnly || lockRole
                  ? "Three concept messages for this area."
                  : "Three concept messages for this area — pick one Primary, and mark the others Secondary or leave them out."}
            </p>
            {groupedMessages.map(({ message: m, position }, k) => (
              <ConceptMessageBox
                key={position}
                label={`Concept message ${k + 1}`}
                message={m}
                loading={messageLoading}
                readOnly={readOnly}
                areaNumber={index + 1}
                onChange={(next) => onGroupedMessageChange?.(position, next)}
                role={m.role ?? "none"}
                roleGroup={`${roleGroup}-area-${index}`}
                lockRole={lockRole}
                onRoleChange={
                  onGroupedRoleChange
                    ? (r) => onGroupedRoleChange(position, r)
                    : undefined
                }
                dimmed={!used}
              />
            ))}
          </>
        ) : (
          <ConceptMessageBox
            label="Concept message for this area"
            message={message}
            loading={messageLoading}
            readOnly={readOnly}
            areaNumber={index + 1}
            onChange={onMessageChange}
          />
        )}
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


/* ── One concept message: title, copy, edit toggle, and (on new 3-per-area
   cycles) its own Primary / Secondary / not-used pick within its area. ── */
function ConceptMessageBox({
  label,
  message,
  loading,
  readOnly,
  areaNumber,
  onChange,
  role,
  roleGroup,
  lockRole = false,
  onRoleChange,
  dimmed = false,
}: {
  label: string
  message?: ConceptMessage
  loading: boolean
  readOnly: boolean
  areaNumber: number
  onChange: (next: Partial<ConceptMessage>) => void
  /** Only on grouped messages. Absent = no role row (old one-per-area cycles,
   *  where the area's own role decides). */
  role?: AreaRole
  roleGroup?: string
  lockRole?: boolean
  onRoleChange?: (role: AreaRole) => void
  /** The area itself is not used, so none of its messages will be either. */
  dimmed?: boolean
}) {
  // A message someone just added arrives empty, so it opens ready to write. A
  // message that is merely still loading is undefined, not empty, which keeps
  // every box from springing open while the messages arrive.
  const [editing, setEditing] = useState(
    () =>
      !readOnly &&
      !!message &&
      !message.title?.trim() &&
      !message.description?.trim(),
  )
  const boxRef = useRef<HTMLDivElement>(null)

  /** Opens or closes the edit fields, scrolling the box into view on open. */
  function toggleEditing(): void {
    const opening = !editing
    setEditing(opening)
    if (!opening) return
    requestAnimationFrame(() => {
      boxRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    })
  }

  const showsRole = role !== undefined

  return (
    <div
      ref={boxRef}
      className={cn(
        "rounded-xl border bg-muted/40 p-4",
        showsRole && role === "primary" ? "border-indigo-300 bg-indigo-50/40" : "border-border/70",
        dimmed && "opacity-60",
      )}
    >
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <MessageSquareQuote className="h-3.5 w-3.5" />
        {label}
      </div>
      {loading ? (
        // Shaped like what is coming, so the box does not jump when it lands.
        <div aria-busy="true" aria-label="Loading concept message" className="space-y-2.5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-[94%]" />
          <Skeleton className="h-3.5 w-[72%]" />
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {readOnly || !editing ? (
                <p className="text-base font-bold text-indigo-700">
                  {message?.title || "No concept message yet"}
                </p>
              ) : (
                <input
                  type="text"
                  value={message?.title ?? ""}
                  onChange={(e) => onChange({ title: e.target.value })}
                  placeholder="Two-word title"
                  aria-label={`${label} title for area ${areaNumber}`}
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-base font-bold text-indigo-700 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              )}
            </div>

            {!readOnly && message && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={toggleEditing}
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
                onChange={(e) => onChange({ description: e.target.value })}
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
                  ? "No concept message was written here."
                  : "Nothing written yet — hit Edit to write it."}
              </p>
            )}
          </div>

          {showsRole && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-2.5">
              <p className="text-xs text-muted-foreground">
                {role === "primary"
                  ? "This area's leading message."
                  : role === "secondary"
                    ? "Also used."
                    : "Not used."}
              </p>
              {readOnly || lockRole || !onRoleChange ? (
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
                <RoleToggle role={role ?? "none"} group={roleGroup ?? "messages"} onChange={onRoleChange} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
