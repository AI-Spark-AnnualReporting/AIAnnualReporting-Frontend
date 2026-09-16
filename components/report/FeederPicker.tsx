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

export interface FeederDepartment {
  department_code: string
  department_name: string
}

interface FeederPickerProps {
  sectionCode: string
  departments: FeederDepartment[]
  selected: string[] // effective department_codes (saved + unsaved)
  children: React.ReactNode // the trigger
  /** Report a department pick upward. Nothing is written here — the Sections
   *  step collects every edit and saves them all when the PM continues. */
  onFeedersChange: (sectionCode: string, departmentCodes: string[]) => void
  // Optional "Upload document later" choice — only relevant for generate sections.
  // `checked` reflects whether the section is in extract mode.
  documentOption?: {
    checked: boolean
    onChange: (next: boolean) => void
    label?: string
  }
  // Whether department feeders mean anything for this section. False on extract:
  // it reads its uploaded document and nothing else — only the analyze path ever
  // consumes department digests. Stated explicitly rather than inferred from the
  // document toggle, which is absent on sections AI may never draft and so read
  // as "departments apply" for exactly the sections where they don't.
  departmentsApply?: boolean
}

// Popover (via DropdownMenu) for selecting which departments feed a section, plus
// an optional document-source toggle. Neither writes to the server: both report
// upward, and the Sections step persists everything on Continue.
export function FeederPicker({
  sectionCode,
  departments,
  selected,
  children,
  onFeedersChange,
  documentOption,
  departmentsApply = true,
}: FeederPickerProps) {
  const [open, setOpen] = useState(false)

  // `selected` is already the effective value (saved plus anything unsaved), so
  // it is the single source of truth here — no local mirror to drift out of sync.
  const docChecked = documentOption?.checked ?? false

  const toggle = (code: string, next: boolean) => {
    if (!departmentsApply) return
    const updated = new Set(selected)
    if (next) updated.add(code)
    else updated.delete(code)

    // Picking a department on a document-sourced section means "use departments
    // instead", so flip it back to generate in the same edit. This used to need
    // an awaited round-trip — the server refuses feeders on an extract section
    // and the switch itself clears them — but both now travel together and are
    // written in the right order at save time.
    if (docChecked && documentOption) documentOption.onChange(false)
    onFeedersChange(sectionCode, [...updated])
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
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
              checked={selected.includes(d.department_code)}
              // Analyze mode uses department feeders, so don't disable them.
              disabled={!departmentsApply}
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
