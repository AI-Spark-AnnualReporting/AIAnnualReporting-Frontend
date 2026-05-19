"use client"

import { useCycles, useCycleOverview } from "@/hooks/useCycles"
import { useUsers } from "@/hooks/useUsers"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DataTable, Column } from "@/components/ui/data-table"
import { StatusBadge } from "@/components/ui/status-badge"
import { EmptyState } from "@/components/ui/empty-state"
import { Progress } from "@/components/ui/progress"
import { Cycle } from "@/types"
import { RefreshCw, Plus, Eye } from "lucide-react"
import Link from "next/link"
import { formatDate } from "@/lib/utils"

export default function CyclesPage() {
  const { data, isLoading } = useCycles()
  // The /admin/cycles list often omits pm_name, returning only project_manager_id.
  // Pull the PM users so we can resolve the id → name ourselves.
  const { data: pmData } = useUsers({ role: "project_manager" })
  const pmNameById: Record<string, string> = {}
  ;(pmData?.users ?? []).forEach((u) => {
    pmNameById[u.user_id] = u.full_name
  })

  const columns: Column<Cycle>[] = [
    {
      key: "name",
      header: "Cycle Name",
      cell: (row) => (
        <div>
          <p className="font-medium">{row.cycle_name}</p>
          <p className="text-xs text-muted-foreground">FY{row.fiscal_year}</p>
        </div>
      ),
    },
    {
      key: "pm",
      header: "Project Manager",
      cell: (row) => {
        const name =
          row.pm_name ||
          (row.project_manager_id ? pmNameById[row.project_manager_id] : undefined)
        return (
          <span className="text-sm">
            {name || (row.project_manager_id ? "Assigned" : "—")}
          </span>
        )
      },
    },
    {
      key: "deadline",
      header: "Deadline",
      cell: (row) => (
        <span className="text-sm">{formatDate(row.submission_deadline)}</span>
      ),
    },
    {
      key: "progress",
      header: "Progress",
      cell: (row) => <CycleProgressCell row={row} />,
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} variant="cycle" />,
    },
    {
      key: "actions",
      header: "",
      cell: (row) => (
        <Link href={`/admin/cycles/${row.id}`}>
          <Button variant="outline" size="sm">
            <Eye className="h-3 w-3 mr-1" /> View
          </Button>
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reporting Cycles"
        description="Manage annual report cycles"
        action={
          <Link href="/admin/cycles/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Cycle
            </Button>
          </Link>
        }
      />

      {!isLoading && (!data?.cycles || data.cycles.length === 0) ? (
        <EmptyState
          icon={RefreshCw}
          title="No cycles yet"
          description="Create your first reporting cycle to begin the annual report process"
          action={
            <Link href="/admin/cycles/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New Cycle
              </Button>
            </Link>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={data?.cycles || []}
          isLoading={isLoading}
          emptyMessage="No cycles found"
        />
      )}
    </div>
  )
}

/**
 * Progress cell for the cycles table. The /admin/cycles list endpoint does not
 * populate per-cycle session counts, so we read accurate numbers from the
 * /admin/cycles/{id}/overview endpoint. Falls back to the raw list counts while
 * the overview is loading.
 */
function CycleProgressCell({ row }: { row: Cycle }) {
  const { data: overview } = useCycleOverview(row.id)
  const stats = overview?.stats

  const total = stats?.total_departments ?? row.total_departments ?? 0
  // "Submitted" includes approved departments — an approved one was submitted too.
  const submitted = stats
    ? stats.submitted + stats.approved
    : row.submitted_count ?? 0
  const pct = total > 0 ? Math.round((submitted / total) * 100) : 0

  return (
    <div className="min-w-32">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{submitted}/{total}</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  )
}
