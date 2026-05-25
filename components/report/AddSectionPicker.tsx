"use client"

import { Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
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

  const items = available.data ?? []
  const empty = !available.isLoading && items.length === 0

  return (
    <section className="pt-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={empty || add.isPending}>
            {add.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5 mr-1.5" />
            )}
            Add optional section
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[260px]">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Optional sections available
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {available.isLoading ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              All optional sections already added.
            </div>
          ) : (
            items.map((item) => {
              const layer = SECTION_LAYERS[item.layer]
              return (
                <DropdownMenuItem
                  key={item.section_code}
                  onClick={() => add.mutate({ sectionCode: item.section_code })}
                  className="flex items-center gap-2"
                >
                  <span className="flex-1">{item.title}</span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                      layer?.color,
                    )}
                  >
                    {layer?.label ?? item.layer}
                  </span>
                </DropdownMenuItem>
              )
            })
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {empty && (
        <p className="text-xs text-muted-foreground mt-1">
          All optional sections have been added to the report.
        </p>
      )}
    </section>
  )
}
