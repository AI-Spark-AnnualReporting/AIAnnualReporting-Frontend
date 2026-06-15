import { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type Accent = "indigo" | "amber" | "green"

const ICON_STYLES: Record<Accent, string> = {
  indigo: "bg-indigo-50 text-indigo-600",
  amber: "bg-amber-50 text-amber-600",
  green: "bg-emerald-50 text-emerald-600",
}

interface PMStatCardProps {
  title: string
  value: string | number
  description?: string
  icon: LucideIcon
  accent?: Accent
  /** Tints the number — used to make the value pop (e.g. amber for pending). */
  valueClassName?: string
  /** Adds the soft amber outline seen on the "Pending Reviews" card. */
  highlight?: boolean
}

export function PMStatCard({
  title,
  value,
  description,
  icon: Icon,
  accent = "indigo",
  valueClassName,
  highlight,
}: PMStatCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-white p-6 shadow-sm transition-shadow hover:shadow-md",
        highlight ? "border-amber-200 ring-1 ring-amber-100" : "border-slate-100"
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <div className={cn("rounded-xl p-2.5", ICON_STYLES[accent])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className={cn("mt-4 text-4xl font-bold tracking-tight text-slate-900", valueClassName)}>
        {value}
      </p>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
    </div>
  )
}
