"use client"

import { useEffect, useRef, useState } from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Check, GripVertical, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ProsePreview } from "@/components/ui/prose-preview"
import { useSaveSubsections } from "@/hooks/useReportBuilder"
import { cn } from "@/lib/utils"
import type { SectionBlock } from "@/types"

// Debounce for save-as-you-type, same as the department outline editor.
// Renames persist ~0.6s after the last keystroke.
const AUTOSAVE_MS = 600

// Minimum length for a subheading — mirrors the outline's rule. Shorter values
// are simply not saved while typing; the revert only happens on blur/Enter.
const MIN_HEADING = 3

/** A lead-in block carries no heading and only ever appears first. */
const isLeadIn = (b: SectionBlock | undefined) => !!b && b.heading === null

/**
 * The paragraphs of one subsection.
 *
 * Rendered through ProsePreview rather than plain <p>s on purpose: each
 * paragraph is a slice of the same Markdown body ProsePreview has always
 * rendered, so it can contain inline emphasis, links, bullet runs or a pipe
 * table. Plain <p>s would print `**like this**` literally and would lose the
 * table normalisation + sanitising ProsePreview does. Joining with a blank line
 * keeps block-level Markdown (lists, tables) parsing correctly.
 */
function BlockParagraphs({
  paragraphs,
  isRtl,
}: {
  paragraphs: string[]
  isRtl: boolean
}) {
  const body = paragraphs.join("\n\n").trim()
  if (!body) {
    return (
      <p className="text-sm italic text-slate-400">
        This subsection has no text yet.
      </p>
    )
  }
  return <ProsePreview content={body} dir={isRtl ? "rtl" : "ltr"} />
}

/**
 * Read-only structured view: bold subheadings + their paragraphs, no controls.
 * Used for locked sections, which stay read-only but should still show their
 * structure rather than falling back to the flat Markdown mirror.
 */
export function SubsectionPreview({
  blocks,
  isRtl = false,
}: {
  blocks: SectionBlock[]
  isRtl?: boolean
}) {
  return (
    <div className="space-y-5">
      {blocks.map((block) => (
        <div key={block.id} className="space-y-1.5">
          {block.heading !== null && (
            // ProsePreview's demoted h3 carries no class, so it inherits only
            // the `prose` cascade (font-weight 600). Style it here so a
            // subheading actually reads as one.
            <h3
              dir={isRtl ? "rtl" : "ltr"}
              className={cn(
                "text-base font-bold tracking-tight text-slate-900",
                isRtl && "text-right",
              )}
            >
              {block.heading}
            </h3>
          )}
          <BlockParagraphs paragraphs={block.paragraphs} isRtl={isRtl} />
        </div>
      ))}
    </div>
  )
}

/**
 * One subheading input. Saves as you type (debounced) and also commits on
 * blur / Enter; Escape reverts. Manages its own last-saved value so a revert
 * stays per-field.
 *
 * Copied from OutlineHeadingCard's OutlineTitleInput with one deliberate
 * difference: the parent keys this component by block id ONLY, not by
 * `id:heading`. The outline can key on the title because its own saves don't
 * touch the query cache; ours do (the mutation patches the section optimistically
 * and again from the server echo), so keying on the heading would remount this
 * input on every successful save and drop any keystrokes typed while the PUT was
 * in flight. Block ids are server-minted and change when the section is
 * regenerated/refined, so keying on the id still resets local state whenever the
 * server replaces the blocks.
 */
function SubheadingInput({
  heading,
  isRtl,
  onCommit,
}: {
  heading: string
  isRtl: boolean
  /** Persists the whole array. Rejects if the save failed (hook has toasted). */
  onCommit: (heading: string) => Promise<unknown>
}) {
  const [value, setValue] = useState(heading)
  const [saved, setSaved] = useState(heading)
  const [showTick, setShowTick] = useState(false)
  const skipBlurRef = useRef(false)
  // Mirror of `saved`, read by async saves/timeouts to compare against the
  // freshest committed value (ref reads are outside render, so this is fine).
  const savedValRef = useRef(heading)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    savedValRef.current = saved
  }, [saved])

  useEffect(
    () => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      if (tickTimer.current) clearTimeout(tickTimer.current)
    },
    [],
  )

  const persist = async (trimmed: string) => {
    try {
      await onCommit(trimmed)
      setSaved(trimmed)
      savedValRef.current = trimmed
      setShowTick(true)
      if (tickTimer.current) clearTimeout(tickTimer.current)
      tickTimer.current = setTimeout(() => setShowTick(false), 1500)
    } catch {
      // Never leave a heading on screen that isn't in the DB. The mutation hook
      // owns the message (including the 409 "section is locked" case), so all
      // this has to do is put the field back.
      setValue(savedValRef.current)
    }
  }

  // Debounced auto-save while typing. Skips no-ops and too-short values silently.
  const scheduleSave = (raw: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      const trimmed = raw.trim()
      if (trimmed === savedValRef.current || trimmed.length < MIN_HEADING) return
      persist(trimmed)
    }, AUTOSAVE_MS)
  }

  // Final commit on blur / Enter: enforce the min-length rule (revert if broken).
  const commitNow = () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    const trimmed = value.trim()
    if (trimmed === savedValRef.current) {
      setValue(savedValRef.current) // normalise whitespace back to the saved value
      return
    }
    if (trimmed.length < MIN_HEADING) {
      setValue(savedValRef.current)
      toast.error(`Subheading must be at least ${MIN_HEADING} characters.`)
      return
    }
    setValue(trimmed)
    persist(trimmed)
  }

  const overLimit = value.length > 100

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <input
          value={value}
          maxLength={120}
          dir={isRtl ? "rtl" : "ltr"}
          aria-label="Subheading"
          onChange={(e) => {
            setValue(e.target.value)
            scheduleSave(e.target.value)
          }}
          onBlur={() => {
            if (skipBlurRef.current) {
              skipBlurRef.current = false
              return
            }
            commitNow()
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              e.currentTarget.blur()
            } else if (e.key === "Escape") {
              skipBlurRef.current = true
              if (debounceTimer.current) clearTimeout(debounceTimer.current)
              setValue(savedValRef.current)
              e.currentTarget.blur()
            }
          }}
          className={cn(
            "min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 text-base font-bold tracking-tight text-slate-900 transition-colors placeholder:text-slate-300 hover:border-slate-200 hover:bg-white focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100",
            isRtl && "text-right",
          )}
        />
        {/* Fixed-width status slot keeps every row's input edge aligned */}
        <div className="flex w-6 shrink-0 items-center justify-center">
          {showTick && (
            <span title="Saved" className="text-emerald-500">
              <Check className="h-4 w-4" />
            </span>
          )}
        </div>
      </div>
      {overLimit && (
        <p className={cn("mt-1 px-1 text-[11px] text-slate-400", isRtl && "text-right")}>
          {value.length}/120
        </p>
      )}
    </div>
  )
}

/** One draggable subsection: grip + editable heading + remove, then its prose. */
function SortableSubsection({
  block,
  isRtl,
  pending,
  onRename,
  onDelete,
}: {
  block: SectionBlock
  isRtl: boolean
  pending: boolean
  onRename: (heading: string) => Promise<unknown>
  onDelete: () => Promise<unknown>
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id })
  const [confirmOpen, setConfirmOpen] = useState(false)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg bg-white px-1 py-2",
        isDragging && "relative z-10 opacity-60 shadow-md",
      )}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="shrink-0 cursor-grab touch-none text-slate-300 transition-colors hover:text-slate-500 active:cursor-grabbing"
          aria-label="Drag to reorder subsection"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <SubheadingInput
          heading={block.heading ?? ""}
          isRtl={isRtl}
          onCommit={onRename}
        />

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-slate-300 hover:text-destructive"
          onClick={() => setConfirmOpen(true)}
          disabled={pending}
          title="Remove this subsection"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Accent rail under the heading, flipped for RTL like the outline card */}
      <div
        className={cn(
          "mt-1.5 border-slate-100",
          isRtl ? "mr-4 border-r-2 pr-4" : "ml-4 border-l-2 pl-4",
        )}
      >
        <BlockParagraphs paragraphs={block.paragraphs} isRtl={isRtl} />
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Remove this subsection?"
        description={`"${block.heading ?? ""}" and its ${block.paragraphs.length} paragraph${
          block.paragraphs.length === 1 ? "" : "s"
        } will be removed from the report. Regenerate the section to get them back.`}
        confirmLabel="Remove"
        variant="destructive"
        isLoading={pending}
        onConfirm={async () => {
          // The mutation hook owns the error message and the cache rollback, so
          // swallow the rejection rather than letting it escape the handler as
          // an unhandled promise rejection.
          await onDelete().catch(() => {})
          setConfirmOpen(false)
        }}
      />
    </li>
  )
}

/**
 * The structured body of an AI-written section: a bold subheading per block
 * with its paragraphs beneath.
 *
 * The PM can rename (save-as-you-type), reorder (drag) and delete subheadings.
 * The paragraphs themselves are read-only here — they change via Regenerate or
 * the Refine box, not by typing. Every one of the three edits sends the WHOLE
 * block array to the same endpoint, so they share one mutation.
 */
export function SubsectionEditor({
  cycleId,
  sectionCode,
  blocks,
  isRtl = false,
}: {
  cycleId: string
  sectionCode: string
  blocks: SectionBlock[]
  isRtl?: boolean
}) {
  const save = useSaveSubsections(cycleId)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Freshest server array, read by the debounced saves and by drag-end. Every
  // mutation rebuilds the full array from this rather than from a render-time
  // closure, so a save that lands mid-typing can't resurrect a stale sibling.
  // (Written in an effect, read outside render — clear of the lint rules.)
  const blocksRef = useRef(blocks)
  useEffect(() => {
    blocksRef.current = blocks
  }, [blocks])

  // The lead-in block has no heading to rename and must stay first, so it sits
  // outside the sortable list entirely — it gets no grip and no remove button.
  const leadIn = isLeadIn(blocks[0]) ? blocks[0] : null
  const sortableBlocks = leadIn ? blocks.slice(1) : blocks
  const ids = sortableBlocks.map((b) => b.id)

  const persist = (next: SectionBlock[]) =>
    save.mutateAsync({ sectionCode, blocks: next })

  const renameBlock = (id: string, heading: string) =>
    persist(blocksRef.current.map((b) => (b.id === id ? { ...b, heading } : b)))

  const deleteBlock = (id: string) =>
    persist(blocksRef.current.filter((b) => b.id !== id))

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const current = blocksRef.current
    const head = isLeadIn(current[0]) ? current.slice(0, 1) : []
    const rest = current.slice(head.length)
    const oldIndex = rest.findIndex((b) => b.id === String(active.id))
    const newIndex = rest.findIndex((b) => b.id === String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    // The hook patches the cache optimistically so the drop lands instantly,
    // and toasts + rolls back on failure — so there is nothing to do here but
    // keep the rejection from escaping as an unhandled promise.
    persist([...head, ...arrayMove(rest, oldIndex, newIndex)]).catch(() => {})
  }

  return (
    <div className="space-y-3">
      {leadIn && (
        <div className="px-1">
          <BlockParagraphs paragraphs={leadIn.paragraphs} isRtl={isRtl} />
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1">
            {sortableBlocks.map((block) => (
              <SortableSubsection
                // Keyed by id alone — see SubheadingInput's note on why the
                // outline's `id:title` key would lose keystrokes here.
                key={block.id}
                block={block}
                isRtl={isRtl}
                pending={save.isPending}
                onRename={(heading) => renameBlock(block.id, heading)}
                onDelete={() => deleteBlock(block.id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {sortableBlocks.length > 0 && (
        <p className={cn("px-1 text-xs text-slate-400", isRtl && "text-right")}>
          Rename a subheading to save it, or drag to reorder. The text beneath
          changes with Regenerate or the refine box.
        </p>
      )}
    </div>
  )
}
