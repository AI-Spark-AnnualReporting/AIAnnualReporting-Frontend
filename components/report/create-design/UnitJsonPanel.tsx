"use client"

/**
 * The raw extraction for one page.
 *
 * Salvaged from the dialog this screen replaced — it is how you check what the
 * model actually pulled out when a page looks wrong.
 */

import { Copy } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import type { DesignUnit } from "@/lib/api/createDesign"

export function UnitJsonPanel({
  unit,
  open,
  onOpenChange,
}: {
  unit: DesignUnit | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (!unit) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(unit.blocks, null, 2))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard is blocked in some contexts; the JSON is selectable anyway.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="truncate">{unit?.title ?? "Page"}</DialogTitle>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={copy}>
              <Copy className="mr-1 h-3 w-3" />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <DialogDescription>
            What the model pulled out of this page, before any template touched it.
          </DialogDescription>
        </DialogHeader>
        <pre
          className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-800"
          style={{ fontFamily: "var(--font-dm-mono), monospace" }}
        >
          {unit ? JSON.stringify(unit.blocks, null, 2) : ""}
        </pre>
      </DialogContent>
    </Dialog>
  )
}
