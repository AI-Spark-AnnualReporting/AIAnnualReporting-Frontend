"use client"

import { useState } from "react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { useSetFeeders } from "@/hooks/useReportBuilder"

export interface FeederDepartment {
  department_code: string
  department_name: string
}

interface FeederPickerProps {
  cycleId: string
  sectionCode: string
  departments: FeederDepartment[]
  selected: string[] // current department_codes
  children: React.ReactNode // the trigger
}

// Popover (via DropdownMenu) for selecting which departments feed a section.
// Batches selection during the menu's lifetime, commits on close.
export function FeederPicker({
  cycleId,
  sectionCode,
  departments,
  selected,
  children,
}: FeederPickerProps) {
  const [open, setOpen] = useState(false)
  const [local, setLocal] = useState<Set<string>>(new Set(selected))
  const setFeeders = useSetFeeders(cycleId)

  // Sync local set with the server-truth `selected` when the menu (re)opens —
  // covers the case where another action (regenerate, etc.) updated feeders
  // while the popover was closed.
  const [prevSelectedKey, setPrevSelectedKey] = useState(selected.join("|"))
  const currentSelectedKey = selected.join("|")
  if (prevSelectedKey !== currentSelectedKey) {
    setPrevSelectedKey(currentSelectedKey)
    setLocal(new Set(selected))
  }

  const toggle = (code: string, next: boolean) => {
    setLocal((prev) => {
      const updated = new Set(prev)
      if (next) updated.add(code)
      else updated.delete(code)
      return updated
    })
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      const current = [...local].sort()
      const previous = [...selected].sort()
      const changed =
        current.length !== previous.length ||
        current.some((c, i) => c !== previous[i])
      if (changed) {
        setFeeders.mutate({ sectionCode, departmentCodes: current })
      }
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[240px]">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Departments feeding this section
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {departments.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            No departments in this cycle.
          </div>
        ) : (
          departments.map((d) => (
            <DropdownMenuCheckboxItem
              key={d.department_code}
              checked={local.has(d.department_code)}
              onCheckedChange={(checked) => toggle(d.department_code, !!checked)}
              onSelect={(e) => e.preventDefault()} // keep the menu open on click
            >
              {d.department_name}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
