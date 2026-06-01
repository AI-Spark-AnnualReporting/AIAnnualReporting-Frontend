"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
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
} from "@/hooks/useReportBuilder"

interface AddSectionPickerProps {
  cycleId: string
}

export function AddSectionPicker({ cycleId }: AddSectionPickerProps) {
  const available = useAvailableOptional(cycleId)
  const add = useAddOptional(cycleId)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  // Move focus from Radix's default first-item target to the search input,
  // and clear the query whenever the dropdown closes.
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => inputRef.current?.focus())
      return () => cancelAnimationFrame(id)
    }
    setQuery("")
  }, [open])

  const items = available.data ?? []
  const empty = !available.isLoading && items.length === 0
  const q = query.trim().toLowerCase()
  const filtered = q
    ? items.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.section_code.toLowerCase().includes(q),
      )
    : items

  return (
    <section className="pt-2">
      <DropdownMenu open={open} onOpenChange={setOpen}>
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
        <DropdownMenuContent align="start" className="w-[320px] p-0">
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
                  ? "No sections available to add."
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
      {empty && (
        <p className="text-xs text-muted-foreground mt-1">
          Every section for this cycle is already in the plan.
        </p>
      )}
    </section>
  )
}
