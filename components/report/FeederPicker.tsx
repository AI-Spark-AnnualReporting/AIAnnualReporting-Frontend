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
  // Optional "Upload document later" choice — only relevant for generate sections.
  // `checked` reflects whether the section is in extract mode (single source of
  // truth). `onChange` switches the source type via the dedicated endpoint. While
  // checked, departments are disabled (extract is document-sourced, not dept-sourced).
  documentOption?: {
    checked: boolean
    onChange: (next: boolean) => void
    label?: string
  }
}

// Popover (via DropdownMenu) for selecting which departments feed a section, plus
// an optional document-source toggle. Department selection batches during the
// menu's lifetime and commits on close; the document toggle switches mode
// immediately via its own endpoint.
export function FeederPicker({
  cycleId,
  sectionCode,
  departments,
  selected,
  children,
  documentOption,
}: FeederPickerProps) {
  const [open, setOpen] = useState(false)
  const [local, setLocal] = useState<Set<string>>(new Set(selected))
  const setFeeders = useSetFeeders(cycleId)

  // Sync local set with server-truth `selected` when the menu (re)opens — covers
  // the case where another action updated feeders while the popover was closed.
  const [prevSelectedKey, setPrevSelectedKey] = useState(selected.join("|"))
  const currentSelectedKey = selected.join("|")
  if (prevSelectedKey !== currentSelectedKey) {
    setPrevSelectedKey(currentSelectedKey)
    setLocal(new Set(selected))
  }

  const docChecked = documentOption?.checked ?? false

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
    // Commit department changes on close. (Mode is handled live by the document
    // toggle, not here.) Skip while in extract mode — it has no departments.
    if (!nextOpen && !docChecked) {
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
              // Extract mode is document-based — departments don't apply.
              // Analyze mode uses department feeders, so don't disable them.
              disabled={docChecked}
              onCheckedChange={(checked) => toggle(d.department_code, !!checked)}
              onSelect={(e) => e.preventDefault()} // keep the menu open on click
            >
              {d.department_name}
            </DropdownMenuCheckboxItem>
          ))
        )}

        {documentOption && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Source mode
            </DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={docChecked}
              onCheckedChange={(checked) => documentOption.onChange(!!checked)}
              onSelect={(e) => e.preventDefault()}
            >
              {documentOption.label ?? "Upload document later"}
            </DropdownMenuCheckboxItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
