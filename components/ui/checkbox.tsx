"use client"

import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface CheckboxProps {
  id: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
  className?: string
}

// Lightweight controlled checkbox — a styled native input plus label.
export function Checkbox({
  id,
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className,
}: CheckboxProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors",
        checked ? "border-primary/40 bg-primary/5" : "border-input hover:bg-muted/40",
        disabled && "cursor-not-allowed opacity-60",
        className
      )}
    >
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center mt-0.5">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded border transition-colors",
            checked
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-background"
          )}
        >
          {checked && <Check className="h-3 w-3" />}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-tight">{label}</span>
        {description && (
          <span className="block text-xs text-muted-foreground mt-0.5">{description}</span>
        )}
      </span>
    </label>
  )
}
