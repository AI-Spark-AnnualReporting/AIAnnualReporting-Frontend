"use client"

import { useState } from "react"
import { Loader2, Sparkles, Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { readError, useAddCustomSection } from "@/hooks/useReportBuilder"
import type { FeederDepartment } from "./FeederPicker"

// The name doubles as the section_code server-side, so these two rules mirror
// _validate_custom_section_name in report_service.py. Keeping them here is for
// the error message only — the server rejects either way.
const NAME_MAX = 50
const FORBIDDEN = /[/\\%]/

// A source choice, styled as a card rather than a radio so the two options
// carry their one-line explanation of what each actually does.
function SourceOption({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  hint: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg border p-2.5 text-start transition-colors",
        active
          ? "border-indigo-300 bg-indigo-50/60"
          : "border-slate-200 hover:bg-slate-50",
      )}
    >
      <span
        className={cn(
          "flex items-center gap-1.5 text-xs font-medium",
          active ? "text-indigo-700" : "text-slate-700",
        )}
      >
        {icon}
        {label}
      </span>
      <span className="mt-0.5 block text-[11px] text-muted-foreground">
        {hint}
      </span>
    </button>
  )
}

interface CustomSectionDialogProps {
  cycleId: string
  departments: FeederDepartment[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CustomSectionDialog({
  cycleId,
  departments,
  open,
  onOpenChange,
}: CustomSectionDialogProps) {
  const add = useAddCustomSection(cycleId)
  const [name, setName] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<"generate" | "extract">("generate")
  // Server rejections (duplicate name, a name that clashes with a built-in
  // section, an unknown department) are all about what was just typed, so they
  // are shown beside the field rather than in a corner toast.
  const [error, setError] = useState<string | null>(null)

  // Reset on close rather than in an effect, so a cancelled draft never
  // reappears on the next section without costing a cascading render.
  const setOpen = (next: boolean) => {
    if (!next) {
      setName("")
      setSelected(new Set())
      setMode("generate")
      setError(null)
    }
    onOpenChange(next)
  }

  const trimmed = name.trim()
  const badChars = FORBIDDEN.test(trimmed)
  const canSubmit = trimmed.length > 0 && !badChars && !add.isPending

  const toggle = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const submit = async () => {
    if (!canSubmit) return
    setError(null)
    try {
      // Feeders are meaningless for extract — the server ignores them anyway.
      await add.mutateAsync({
        name: trimmed,
        feeders: mode === "generate" ? [...selected] : [],
        mode,
      })
      setOpen(false)
    } catch (err) {
      // Stay open with everything intact so the name can just be edited.
      setError(readError(err as Parameters<typeof readError>[0], "Couldn't add the section."))
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create your own section</DialogTitle>
          <DialogDescription>
            The narrative agent writes it from the departments you choose.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="custom-section-name"
              className="text-xs font-medium text-slate-700"
            >
              Section name
            </label>
            <Input
              id="custom-section-name"
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => {
                setName(e.target.value)
                if (error) setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit()
              }}
              placeholder="e.g. Sustainability Roadmap"
              autoFocus
            />
            <div className="flex items-start justify-between gap-2">
              {/* A server rejection outranks the local hint — it is the reason
                  the section wasn't added, and it names what to change. */}
              {error ? (
                <p className="text-[11px] text-red-600">{error}</p>
              ) : (
                <p className="text-[11px] text-amber-600">
                  {badChars ? "Cannot contain / \\ or %." : ""}
                </p>
              )}
              <p className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {trimmed.length}/{NAME_MAX}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-700">
              Where does its content come from?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <SourceOption
                active={mode === "generate"}
                onClick={() => setMode("generate")}
                icon={<Sparkles className="h-3.5 w-3.5" />}
                label="AI-refine"
                hint="From department data"
              />
              <SourceOption
                active={mode === "extract"}
                onClick={() => setMode("extract")}
                icon={<Upload className="h-3.5 w-3.5" />}
                label="Upload later"
                hint="AI reads your document"
              />
            </div>
          </div>

          {mode === "generate" ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-700">
                Which departments&apos; data goes in it?
              </p>
              {departments.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No departments on this cycle yet.
                </p>
              ) : (
                <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-slate-100 p-1.5">
                  {departments.map((d) => (
                    <Checkbox
                      key={d.department_code}
                      id={`custom-dept-${d.department_code}`}
                      checked={selected.has(d.department_code)}
                      onCheckedChange={() => toggle(d.department_code)}
                      label={d.department_name}
                    />
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                You can change these later from the section card.
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              You&apos;ll upload the document from the section card. Departments
              don&apos;t apply — you can switch back to AI-refine any time.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={add.isPending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {add.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Add section
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
