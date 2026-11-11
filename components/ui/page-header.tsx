import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string
  // A node, not just a string, so a page can skeleton part of the line while
  // the value behind it loads.
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && (
          // A div, not a p: descriptions can hold block content (e.g. a
          // loading skeleton), which is invalid inside <p> and breaks hydration.
          <div className="mt-1 text-sm text-muted-foreground">{description}</div>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-3">{action}</div>}
    </div>
  )
}
