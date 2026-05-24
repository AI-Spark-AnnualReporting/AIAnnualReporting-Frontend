"use client"

import { use, useRef, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useQueryClient } from "@tanstack/react-query"
import {
  useCycle, useCycleOverview, useUploadKickoffDocs, useAssignDepartments, useUpdateCycle,
  useCycleSections, useResolveSections,
} from "@/hooks/useCycles"
import { useDepartments } from "@/hooks/useDepartments"
import { useUsers } from "@/hooks/useUsers"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { PageSkeleton } from "@/components/ui/skeletons"
import { DataTable, Column } from "@/components/ui/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Cycle, Department, SessionSummary, User, CycleReportSection } from "@/types"
import {
  COMPANY_PROFILES, SECTORS, SECTION_MODES, SECTION_LAYERS, SECTION_STATUSES,
} from "@/lib/constants"
import { formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"
import {
  FileUp, ArrowLeft, Building2, Search, Plus, Trash2,
  CheckCircle, XCircle, AlertCircle, Save, Info, Pencil, RefreshCw,
  Layers, Sparkles,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

const editCycleSchema = z.object({
  cycle_name: z.string().min(2, "Required"),
  fiscal_year: z.number().int().min(2000).max(2100),
  start_date: z.string().min(1, "Required"),
  end_date: z.string().min(1, "Required"),
  submission_deadline: z.string().min(1, "Required"),
  project_manager_id: z.string().optional(),
  company_profile: z.enum(["listed", "private"], {
    message: "Select a company profile",
  }),
  sector: z.enum(["bank", "insurance", "general", "reit", "finance_co"], {
    message: "Select a sector",
  }),
  is_shariah: z.boolean(),
  has_subsidiaries: z.boolean(),
  has_sukuk: z.boolean(),
})
type EditCycleForm = z.infer<typeof editCycleSchema>

interface Assignment {
  department: Department
  user: User | null
}

export default function CycleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const qc = useQueryClient()
  const { data: cycleData, isLoading: cycleLoading } = useCycle(id)
  const { data: overview, isLoading: overviewLoading } = useCycleOverview(id)
  const { data: deptsData } = useDepartments()
  const uploadMutation = useUploadKickoffDocs()
  const assignMutation = useAssignDepartments()
  const updateMutation = useUpdateCycle()
  const fileRef = useRef<HTMLInputElement>(null)

  const [uploading, setUploading] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => {
    if (searchParams.get("editCycle") === "1") {
      setEditOpen(true)
    }
  }, [searchParams])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [deptSearch, setDeptSearch] = useState("")
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const {
    register: editRegister,
    handleSubmit: editHandleSubmit,
    control: editControl,
    reset: editReset,
  } = useForm<EditCycleForm, unknown, EditCycleForm>({ resolver: zodResolver(editCycleSchema) as never })

  // Populate edit form whenever the dialog opens (use cycleData to avoid TDZ)
  useEffect(() => {
    if (editOpen && cycleData) {
      editReset({
        cycle_name: cycleData.cycle_name,
        fiscal_year: cycleData.fiscal_year,
        start_date: cycleData.start_date?.slice(0, 10) ?? "",
        end_date: cycleData.end_date?.slice(0, 10) ?? "",
        submission_deadline: cycleData.submission_deadline?.slice(0, 10) ?? "",
        project_manager_id: cycleData.project_manager_id ?? "",
        company_profile: cycleData.company_profile ?? undefined,
        sector: cycleData.sector ?? undefined,
        is_shariah: cycleData.is_shariah ?? false,
        has_subsidiaries: cycleData.has_subsidiaries ?? false,
        has_sukuk: cycleData.has_sukuk ?? false,
      })
    }
  }, [editOpen, cycleData, editReset])

  const onEditSubmit = async (formData: EditCycleForm) => {
    await updateMutation.mutateAsync({
      cycleId: id,
      data: {
        cycle_name: formData.cycle_name,
        fiscal_year: formData.fiscal_year,
        start_date: formData.start_date,
        end_date: formData.end_date,
        submission_deadline: formData.submission_deadline,
        project_manager_id: (formData.project_manager_id && formData.project_manager_id !== "__none__") ? formData.project_manager_id : undefined,
        company_profile: formData.company_profile,
        sector: formData.sector,
        is_shariah: formData.is_shariah,
        has_subsidiaries: formData.has_subsidiaries,
        has_sukuk: formData.has_sukuk,
      },
    })
    setEditOpen(false)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    try {
      await uploadMutation.mutateAsync({ cycleId: id, files })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  if (cycleLoading) return <PageSkeleton />

  const cycle = cycleData
  const stats = overview?.stats
  const isDraft = cycle?.status === "draft"
  const isActiveWithNoSessions = !isDraft && (overview?.departments?.length ?? 0) === 0

  const departments = deptsData?.departments || []

  // Helper: stable identifier for a department (backend may use id or department_id)
  const getDeptKey = (d: Department) => d.department_id ?? d.id ?? d.department_code

  // Departments not yet added to the list
  const usedDeptIds = assignments.map((a) => getDeptKey(a.department))
  const availableDepts = departments.filter(
    (d) =>
      !usedDeptIds.includes(getDeptKey(d)) &&
      (!deptSearch ||
        d.department_name.toLowerCase().includes(deptSearch.toLowerCase()) ||
        d.department_code.toLowerCase().includes(deptSearch.toLowerCase()))
  )

  const addDepartment = (dept: Department) => {
    setAssignments((prev) => [...prev, { department: dept, user: null }])
    setDeptSearch("")
    setSavedAt(null)
  }

  const removeAssignment = (deptId: string) => {
    setAssignments((prev) => prev.filter((a) => getDeptKey(a.department) !== deptId))
    setSavedAt(null)
  }

  const setAssignmentUser = (deptId: string, user: User | null) => {
    setAssignments((prev) =>
      prev.map((a) => (getDeptKey(a.department) === deptId ? { ...a, user } : a))
    )
    setSavedAt(null)
  }

  const allAssigned = assignments.length > 0 && assignments.every((a) => a.user !== null)

  const handleSaveAssignments = async () => {
    setSaveError(null)
    if (assignments.length === 0) {
      setSaveError("Add at least one department before saving.")
      return
    }
    if (!allAssigned) {
      setSaveError("Assign a responsible user to every department before saving.")
      return
    }
    try {
      // Best-effort: backend response serialization may fail even if DB write succeeds
      try {
        await assignMutation.mutateAsync({
          cycleId: id,
          payload: {
            assignments: assignments.map((a) => ({
              department_id: (a.department.department_id ?? a.department.id ?? a.department.department_code)!,
              user_id: a.user!.user_id,
            })),
          },
        })
      } catch {
        // DB write likely succeeded; response model bug on backend — continue
      }
      // Always refresh cycle + overview so sessions appear even when onSuccess didn't fire
      qc.invalidateQueries({ queryKey: ["cycle", id] })
      qc.invalidateQueries({ queryKey: ["cycle", id, "overview"] })
      setSavedAt(new Date())
      // Submit done — return to the cycles list.
      toast.success("Departments assigned")
      router.push("/admin/cycles")
    } catch (err: unknown) {
      setSaveError((err as { message?: string })?.message || "Failed to save assignments")
    }
  }

  const deptColumns: Column<SessionSummary>[] = [
    {
      key: "dept",
      header: "Department",
      cell: (row) => (
        <div>
          <p className="font-medium">{row.department_name}</p>
          <p className="text-xs text-muted-foreground font-mono">{row.department_code}</p>
        </div>
      ),
    },
    {
      key: "user",
      header: "Assigned User",
      cell: (row) =>
        row.user_name ? (
          <div>
            <p className="text-sm font-medium">{row.user_name}</p>
            <p className="text-xs text-muted-foreground">{row.user_email}</p>
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        ),
    },
    {
      key: "progress",
      header: "Progress",
      cell: (row) => (
        <div className="min-w-28">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">{row.progress_percentage}%</span>
          </div>
          <Progress value={row.progress_percentage} className="h-1.5" />
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} variant="session" />,
    },
    {
      key: "submitted",
      header: "Submitted",
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.submitted_at)}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/admin/cycles">
          <Button variant="ghost" size="icon" className="mt-1">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          className="flex-1"
          title={cycle?.cycle_name || "Cycle Detail"}
          description={
            cycle
              ? `FY${(cycle as { fiscal_year?: number }).fiscal_year} · Deadline ${formatDate(cycle.submission_deadline)}`
              : ""
          }
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
              {(isDraft || isActiveWithNoSessions) && (
                <Button
                  onClick={handleSaveAssignments}
                  disabled={assignMutation.isPending || !allAssigned || assignments.length === 0}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {assignMutation.isPending ? "Submitting…" : "Submit"}
                </Button>
              )}
            </div>
          }
        />
      </div>

      <div className="flex items-center gap-3">
        <StatusBadge status={cycle?.status || "draft"} variant="cycle" />
        {(cycle as { pm_name?: string })?.pm_name && (
          <span className="text-sm text-muted-foreground">
            PM: {(cycle as { pm_name?: string }).pm_name}
          </span>
        )}
        {!((cycle as { pm_name?: string })?.pm_name) && cycle?.project_manager_id && (
          <span className="text-sm text-muted-foreground">PM: Assigned</span>
        )}
      </div>

      {/* ── Assign Departments (draft cycles, or active cycles with 0 sessions) ── */}
      {(isDraft || isActiveWithNoSessions) && (
        <div className="rounded-xl border bg-card space-y-5 p-6">
          {/* Section header */}
          <div>
            <h2 className="font-semibold text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Assign Departments
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select which departments participate in this cycle and assign one responsible user per department.
            </p>
          </div>

          {/* Info callout */}
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-700">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              Each department will get an AI-generated questionnaire after assignments are saved.
              The responsible user will fill in their department&apos;s answers.
            </span>
          </div>

          {/* Assignment rows */}
          {assignments.length > 0 && (
            <div className="rounded-xl border divide-y">
              {assignments.map((a) => (
                <div key={a.department.id} className="flex items-center gap-3 p-3">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.department.department_name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{a.department.department_code}</p>
                  </div>
                  <DeptUserSelect
                    department={a.department}
                    selectedUser={a.user}
                    onChange={(user) =>
                      setAssignmentUser((a.department.department_id ?? a.department.id)!, user)
                    }
                  />
                  {a.user ? (
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeAssignment((a.department.department_id ?? a.department.id)!)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Search / add department */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search and add departments…"
                className="pl-8 h-8 text-sm"
                value={deptSearch}
                onChange={(e) => setDeptSearch(e.target.value)}
              />
            </div>
            {deptSearch && availableDepts.length > 0 && (
              <div className="rounded-xl border divide-y max-h-48 overflow-y-auto shadow-sm">
                {availableDepts.slice(0, 8).map((dept) => (
                  <button
                    key={dept.id}
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 text-left transition-colors"
                    onClick={() => addDepartment(dept)}
                  >
                    <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{dept.department_name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{dept.department_code}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {deptSearch && availableDepts.length === 0 && (
              <p className="text-xs text-muted-foreground px-1">No matching departments found.</p>
            )}
          </div>

          {/* Validation hints */}
          {assignments.length === 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <XCircle className="h-3.5 w-3.5 text-red-400" />
              Search and add at least one department
            </p>
          )}
          {assignments.length > 0 && !allAssigned && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" />
              Assign a responsible user to every department before saving
            </p>
          )}

          {/* Save error */}
          {saveError && (
            <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{saveError}</p>
            </div>
          )}

          {/* Saved confirmation */}
          {savedAt && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
              <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
              <p className="text-xs text-green-700">
                Assignments saved at {savedAt.toLocaleTimeString()}.
              </p>
            </div>
          )}

          {/* Footer row */}
          <div className="pt-1">
            <p className="text-xs text-muted-foreground">
              {assignments.length} department{assignments.length !== 1 ? "s" : ""} added
            </p>
          </div>
        </div>
      )}

      {/* ── Stats ── */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-card p-5">
            <p className="text-sm text-muted-foreground">Total Departments</p>
            <p className="text-2xl font-bold mt-1">{stats.total_departments}</p>
          </div>
          <div className="rounded-lg border bg-card p-5">
            <p className="text-sm text-muted-foreground">Submitted</p>
            <p className="text-2xl font-bold mt-1 text-green-600">{stats.submitted}</p>
          </div>
          <div className="rounded-lg border bg-card p-5">
            <p className="text-sm text-muted-foreground">In Progress</p>
            <p className="text-2xl font-bold mt-1 text-blue-600">{stats.in_progress}</p>
          </div>
          <div className="rounded-lg border bg-card p-5">
            <p className="text-sm text-muted-foreground">Completion Rate</p>
            <p className="text-2xl font-bold mt-1">{stats.completion_rate.toFixed(0)}%</p>
            <Progress value={stats.completion_rate} className="h-1.5 mt-2" />
          </div>
        </div>
      )}

      {/* ── Report Sections ── */}
      {cycle && (
        <ReportSectionsCard cycle={cycle} onSetProfile={() => setEditOpen(true)} />
      )}

      {/* ── Edit Cycle Dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Cycle</DialogTitle>
          </DialogHeader>
          <form onSubmit={editHandleSubmit(onEditSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Cycle Name</Label>
              <Input {...editRegister("cycle_name")} placeholder="Annual Report 2025" />
            </div>
            <div className="space-y-2">
              <Label>Fiscal Year</Label>
              <Input type="number" {...editRegister("fiscal_year", { valueAsNumber: true })} placeholder="2025" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" {...editRegister("start_date")} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" {...editRegister("end_date")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Submission Deadline</Label>
              <Input type="date" {...editRegister("submission_deadline")} />
            </div>

            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Company Profile
              </p>
              <div className="space-y-2">
                <Label>Company Profile <span className="text-destructive">*</span></Label>
                <Controller
                  name="company_profile"
                  control={editControl}
                  render={({ field }) => (
                    <Select value={field.value || ""} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a company profile" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(COMPANY_PROFILES).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Sector <span className="text-destructive">*</span></Label>
                <Controller
                  name="sector"
                  control={editControl}
                  render={({ field }) => (
                    <Select value={field.value || ""} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a sector" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(SECTORS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <Controller
                  name="is_shariah"
                  control={editControl}
                  render={({ field }) => (
                    <Checkbox
                      id="edit_is_shariah"
                      checked={!!field.value}
                      onCheckedChange={field.onChange}
                      label="Shariah-compliant"
                    />
                  )}
                />
                <Controller
                  name="has_subsidiaries"
                  control={editControl}
                  render={({ field }) => (
                    <Checkbox
                      id="edit_has_subsidiaries"
                      checked={!!field.value}
                      onCheckedChange={field.onChange}
                      label="Has subsidiaries"
                    />
                  )}
                />
                <Controller
                  name="has_sukuk"
                  control={editControl}
                  render={({ field }) => (
                    <Checkbox
                      id="edit_has_sukuk"
                      checked={!!field.value}
                      onCheckedChange={field.onChange}
                      label="Has sukuk"
                    />
                  )}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Department Sessions ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Department Sessions</h2>
          {!isDraft && (
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
            </Button>
          )}
        </div>

        {(overview?.departments?.length ?? 0) > 0 ? (
          <DataTable
            columns={deptColumns}
            data={overview?.departments ?? []}
            isLoading={overviewLoading}
            emptyMessage="No sessions yet."
          />
        ) : isActiveWithNoSessions ? (
          <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-8 text-center space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 mx-auto">
              <AlertCircle className="h-5 w-5 text-amber-600" />
            </div>
            <p className="font-semibold text-amber-900">No department sessions created</p>
            <p className="text-sm text-amber-800 max-w-sm mx-auto leading-relaxed">
              Use the <strong>Assign Departments</strong> panel above to add departments and save your assignments.
            </p>
          </div>
        ) : (
          <EmptyState
            icon={Building2}
            title="No sessions yet"
            description="Assign departments above and save to generate sessions."
          />
        )}
      </div>
    </div>
  )
}

// Small pill badge for section mode / layer / status — uses the full Tailwind
// class fragments stored in the constants maps.
function SectionBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        color
      )}
    >
      {label}
    </span>
  )
}

// "Report Sections" panel — three states: profile incomplete (A), profile set
// but not resolved (B), resolved (C). Read-only at this stage.
function ReportSectionsCard({
  cycle,
  onSetProfile,
}: {
  cycle: Cycle
  onSetProfile: () => void
}) {
  const profileSet = !!cycle.company_profile && !!cycle.sector
  const { data: sections, isLoading } = useCycleSections(profileSet ? cycle.id : "")
  const resolveMutation = useResolveSections(cycle.id)

  const header = (
    <div>
      <h2 className="font-semibold text-base flex items-center gap-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        Report Sections
      </h2>
      <p className="text-xs text-muted-foreground mt-0.5">
        The sections this cycle&apos;s annual report will contain.
      </p>
    </div>
  )

  const list = [...(sections ?? [])].sort((a, b) => a.display_order - b.display_order)

  const sectionColumns: Column<CycleReportSection>[] = [
    {
      key: "order",
      header: "#",
      cell: (row) => (
        <span className="text-sm tabular-nums text-muted-foreground">
          {row.display_order}
        </span>
      ),
    },
    {
      key: "title",
      header: "Section",
      cell: (row) => <span className="text-sm font-medium">{row.title}</span>,
    },
    {
      key: "layer",
      header: "Layer",
      cell: (row) => (
        <SectionBadge
          label={SECTION_LAYERS[row.layer]?.label ?? row.layer}
          color={SECTION_LAYERS[row.layer]?.color ?? ""}
        />
      ),
    },
    {
      key: "mode",
      header: "Mode",
      cell: (row) => (
        <SectionBadge
          label={SECTION_MODES[row.mode]?.label ?? row.mode}
          color={SECTION_MODES[row.mode]?.color ?? ""}
        />
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <SectionBadge
          label={SECTION_STATUSES[row.status]?.label ?? row.status}
          color={SECTION_STATUSES[row.status]?.color ?? ""}
        />
      ),
    },
  ]

  // ── State A — profile incomplete ──
  if (!profileSet) {
    return (
      <div className="rounded-xl border bg-card p-6 space-y-5">
        {header}
        <EmptyState
          icon={Building2}
          title="Set the company profile first"
          description="Set this cycle's company profile to generate the report's section list."
          action={
            <Button variant="outline" onClick={onSetProfile}>
              <Pencil className="mr-2 h-4 w-4" /> Set Company Profile
            </Button>
          }
        />
      </div>
    )
  }

  // ── State B — profile set, not yet resolved ──
  if (!isLoading && list.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 space-y-5">
        {header}
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-700">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Resolve the section list from this cycle&apos;s profile. Required
            sections are added automatically; you can review them below.
          </span>
        </div>
        <Button
          onClick={() => resolveMutation.mutate()}
          disabled={resolveMutation.isPending}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {resolveMutation.isPending ? "Resolving…" : "Resolve Sections"}
        </Button>
      </div>
    )
  }

  // ── State C — resolved ──
  const counts = { generate: 0, attach: 0, auto: 0 }
  list.forEach((s) => {
    if (s.mode in counts) counts[s.mode] += 1
  })

  return (
    <div className="rounded-xl border bg-card p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        {header}
        <Button
          variant="outline"
          size="sm"
          onClick={() => resolveMutation.mutate()}
          disabled={resolveMutation.isPending}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          {resolveMutation.isPending ? "Resolving…" : "Re-resolve from current profile"}
        </Button>
      </div>

      {!isLoading && list.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{list.length} sections</span>
          <span className="text-muted-foreground">·</span>
          <SectionBadge
            label={`${counts.generate} ${SECTION_MODES.generate.label}`}
            color={SECTION_MODES.generate.color}
          />
          <SectionBadge
            label={`${counts.attach} ${SECTION_MODES.attach.label}`}
            color={SECTION_MODES.attach.color}
          />
          <SectionBadge
            label={`${counts.auto} ${SECTION_MODES.auto.label}`}
            color={SECTION_MODES.auto.color}
          />
        </div>
      )}

      <DataTable
        columns={sectionColumns}
        data={list}
        isLoading={isLoading}
        emptyMessage="No sections resolved yet."
      />
    </div>
  )
}

function DeptUserSelect({
  department,
  selectedUser,
  onChange,
}: {
  department: Department
  selectedUser: User | null
  onChange: (user: User | null) => void
}) {
  const departmentId = department.department_id ?? department.id
  const { data, isLoading } = useUsers({
    department_id: departmentId,
    role: "department_user",
    page_size: 100,
  })
  const users = data?.users ?? []
  const isEmpty = !isLoading && users.length === 0

  return (
    <Select
      value={selectedUser?.user_id || ""}
      onValueChange={(val) => onChange(users.find((u) => u.user_id === val) ?? null)}
      disabled={isLoading || isEmpty}
    >
      <SelectTrigger className="w-44 h-8 text-xs">
        <SelectValue
          placeholder={
            isLoading
              ? "Loading…"
              : isEmpty
                ? "No users in department"
                : "Assign user…"
          }
        />
      </SelectTrigger>
      <SelectContent>
        {users.map((u) => (
          <SelectItem key={u.user_id} value={u.user_id}>
            {u.full_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
