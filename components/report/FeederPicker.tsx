"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
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
    // May return a promise — the picker awaits it before writing feeders, so a
    // department click can flip the section out of extract mode first.
    onChange: (next: boolean) => void | Promise<unknown>
    label?: string
    // True while the mode switch is in flight (either direction).
    pending?: boolean
  }
  // Whether department feeders mean anything for this section. False on extract:
  // it reads its uploaded document and nothing else — only the analyze path ever
  // consumes department digests. Stated explicitly rather than inferred from the
  // document toggle, which is absent on sections AI may never draft and so read
  // as "departments apply" for exactly the sections where they don't.
  departmentsApply?: boolean
}

// Popover (via DropdownMenu) for selecting which departments feed a section, plus
// an optional document-source toggle. Both commit immediately on click — the
// document toggle via its own endpoint, departments via setFeeders.
export function FeederPicker({
  cycleId,
  sectionCode,
  departments,
  selected,
  children,
  documentOption,
  departmentsApply = true,
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

  // Commit on each click, not on close — the card's pill/badge is driven by the
  // mutation's optimistic cache update, so batching made the card look frozen
  // until the popover was dismissed.
  const toggle = async (code: string, next: boolean) => {
    const updated = new Set(local)
    if (next) updated.add(code)
    else updated.delete(code)
    setLocal(updated)
    if (!departmentsApply) return
    // Picking a department on a document-sourced section means "use departments
    // instead". Switch the mode back FIRST and wait for it: the server refuses
    // feeders on an extract section, and the switch itself clears them — so a
    // parallel write would be wiped by the very mutation that enables it.
    if (docChecked && documentOption) {
      try {
        await documentOption.onChange(false)
      } catch {
        setLocal(new Set(selected)) // switch failed (it toasts) — undo the tick
        return
      }
    }
    setFeeders.mutate({ sectionCode, departmentCodes: [...updated] })
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[240px]">
        <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
          Departments feeding this section
          {setFeeders.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
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
            <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
              Source mode
              {documentOption.pending && (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
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
