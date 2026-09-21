"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Plus, Search, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { SECTION_LAYERS } from "@/lib/constants"
import { cn } from "@/lib/utils"
import {
  useAddOptional,
  useAvailableOptional,
  useCreateCustomSection,
  useDeleteCustomSection,
} from "@/hooks/useReportBuilder"

interface AddSectionPickerProps {
  cycleId: string
}

// Names the renderer treats as furniture rather than content — a section landing on
// either would silently never appear in the report. The server rejects them too; this
// is only so the PM finds out while typing instead of after submitting.
const RESERVED_TITLE = /^\s*(cover|toc|table[-_ ]?of[-_ ]?contents)\s*$/i

export function AddSectionPicker({ cycleId }: AddSectionPickerProps) {
  const available = useAvailableOptional(cycleId)
  const add = useAddOptional(cycleId)
  const create = useCreateCustomSection(cycleId)
  const del = useDeleteCustomSection(cycleId)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  // The create form is a sibling of the dropdown, not a row inside it. It has to be
  // reachable in exactly the state that empties the dropdown and disables its trigger —
  // every section already on the plan — which is the whole reason the feature exists.
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState("")
  const titleRef = useRef<HTMLInputElement>(null)
  const [pendingDelete, setPendingDelete] = useState<{
    section_code: string
    title: string
  } | null>(null)

  // Focus only. The text resets live in the open/close handlers instead of here:
  // clearing state synchronously inside an effect triggers a second render pass for
  // something the event already knows (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    if (!creating) return
    const id = requestAnimationFrame(() => titleRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [creating])

  const openPicker = (v: boolean) => {
    setOpen(v)
    if (!v) setQuery("")
  }

  const showCreate = (v: boolean) => {
    setCreating(v)
    setTitle("")
  }

  const items = available.data?.available ?? []
  const canCreate = available.data?.can_create ?? false
  const blockedReason = available.data?.create_blocked_reason ?? null
  const empty = !available.isLoading && items.length === 0
  const q = query.trim().toLowerCase()
  const filtered = q
    ? items.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.section_code.toLowerCase().includes(q),
      )
    : items

  const trimmed = title.trim()
  const duplicate = items.some(
    (i) => i.title.trim().toLowerCase() === trimmed.toLowerCase(),
  )
  const titleError = !trimmed
    ? null
    : trimmed.length < 2
      ? "A bit longer, please."
      : RESERVED_TITLE.test(trimmed)
        ? "That name is reserved for the report's cover and contents page."
        : duplicate
          ? "You already have a section with that name."
          : null
  const canSubmit = trimmed.length >= 2 && !titleError && !create.isPending

  const submit = async () => {
    if (!canSubmit) return
    await create.mutateAsync({ title: trimmed })
    showCreate(false)
  }

  return (
    <section className="pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu open={open} onOpenChange={openPicker}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={empty || add.isPending}>
              {add.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5 mr-1.5" />
              )}
              Add section
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[340px] p-0">
            <div className="px-3 pt-2.5 pb-1">
              <DropdownMenuLabel className="px-0 py-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Sections you can add
              </DropdownMenuLabel>
            </div>
            <div className="px-2 pb-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search sections…"
                  className="h-8 pl-7 text-xs"
                  // Stop Radix's built-in typeahead from hijacking the input.
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <DropdownMenuSeparator className="my-0" />

            {/* Scrollable carousel of matching sections */}
            <div className="max-h-64 overflow-y-auto overscroll-contain py-1">
              {available.isLoading ? (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  Loading…
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {items.length === 0
                    ? "Every section is already in the plan."
                    : `No sections match "${query.trim()}".`}
                </div>
              ) : (
                filtered.map((item) => {
                  const layer = SECTION_LAYERS[item.layer]
                  return (
                    <DropdownMenuItem
                      key={item.section_code}
                      onSelect={() =>
                        add.mutate({ sectionCode: item.section_code })
                      }
                      className="flex items-center gap-2"
                    >
                      <span className="flex-1 truncate">{item.title}</span>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium shrink-0",
                          layer?.color,
                        )}
                      >
                        {layer?.label ?? item.layer}
                      </span>
                      {item.is_company_section && (
                        // Deleting is a different act from adding, so it must not fall
                        // through to the row's onSelect. A shared catalogue section has
                        // no × — it belongs to every company on the platform.
                        <button
                          type="button"
                          aria-label={`Delete "${item.title}" from this company`}
                          title="Delete from this company for good"
                          className="shrink-0 rounded p-0.5 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setPendingDelete(item)
                            setOpen(false)
                          }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </DropdownMenuItem>
                  )
                })
              )}
            </div>

            {filtered.length > 0 && (
              <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground tabular-nums">
                {filtered.length} of {items.length}
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {canCreate && !creating && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => showCreate(true)}
            disabled={create.isPending}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Create section
          </Button>
        )}
      </div>

      {creating && (
        <div className="mt-2 max-w-md rounded-lg border bg-card p-3">
          <label
            htmlFor="new-section-title"
            className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
          >
            New section
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <Input
              id="new-section-title"
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void submit()
                }
                if (e.key === "Escape") showCreate(false)
              }}
              placeholder="e.g. Our new EV division"
              maxLength={255}
              className="h-8 text-xs"
            />
            <Button size="sm" onClick={() => void submit()} disabled={!canSubmit}>
              {create.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Create"
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => showCreate(false)}
              disabled={create.isPending}
            >
              Cancel
            </Button>
          </div>
          <p
            className={cn(
              "mt-1.5 text-[11px]",
              titleError ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {titleError ??
              "This joins your company's section list, so next year's report offers it again."}
          </p>
        </div>
      )}

      {empty && !canCreate && (
        <p className="text-xs text-muted-foreground mt-1">
          {blockedReason ?? "Every section for this cycle is already in the plan."}
        </p>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(v) => !v && setPendingDelete(null)}
        title="Delete this section for good?"
        description={
          pendingDelete
            ? `"${pendingDelete.title}" will be removed from your company's section list, so it won't be offered on future reports either. Taking it off this report only is the × on the section card instead.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        isLoading={del.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return
          await del.mutateAsync({ sectionCode: pendingDelete.section_code })
          setPendingDelete(null)
        }}
      />
    </section>
  )
}
