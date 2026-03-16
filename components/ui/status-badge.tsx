import { cn } from "@/lib/utils"
import { SESSION_STATUSES, CYCLE_STATUSES, USER_STATUSES } from "@/lib/constants"

type BadgeVariant = "session" | "cycle" | "user"

const colorMap: Record<string, string> = {
  gray: "bg-gray-100 text-gray-700 border-gray-200",
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  purple: "bg-purple-100 text-purple-700 border-purple-200",
  indigo: "bg-indigo-100 text-indigo-700 border-indigo-200",
  green: "bg-green-100 text-green-700 border-green-200",
  red: "bg-red-100 text-red-700 border-red-200",
  orange: "bg-orange-100 text-orange-700 border-orange-200",
  yellow: "bg-yellow-100 text-yellow-700 border-yellow-200",
}

interface StatusBadgeProps {
  status: string
  variant?: BadgeVariant
  className?: string
}

export function StatusBadge({ status, variant = "session", className }: StatusBadgeProps) {
  let config: { label: string; color: string } | undefined

  if (variant === "session") config = SESSION_STATUSES[status as keyof typeof SESSION_STATUSES]
  else if (variant === "cycle") config = CYCLE_STATUSES[status as keyof typeof CYCLE_STATUSES]
  else if (variant === "user") config = USER_STATUSES[status as keyof typeof USER_STATUSES]

  if (!config) {
    return (
      <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 border-gray-200", className)}>
        {status}
      </span>
    )
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        colorMap[config.color] || colorMap.gray,
        className
      )}
    >
      {config.label}
    </span>
  )
}
