"use client"

import { useState } from "react"
import { useDepartments, useCreateDepartment } from "@/hooks/useDepartments"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DataTable, Column } from "@/components/ui/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Department } from "@/types"
import { Building2, Plus, Brain, ChevronRight, Lock, UserCog } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { formatDate } from "@/lib/utils"
import Link from "next/link"

const schema = z.object({
  department_code: z
    .string()
    .min(2, "Min 2 characters")
    .max(10, "Max 10 characters")
    .transform((v) => v.toUpperCase()),
  department_name: z.string().min(2, "Required"),
  description: z.string().optional(),
})
type Form = z.infer<typeof schema>

export default function DepartmentsPage() {
  const { data, isLoading } = useDepartments()
  const createMutation = useCreateDepartment()
  const [open, setOpen] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Form>({ resolver: zodResolver(schema) })

  const onSubmit = async (formData: Form) => {
    await createMutation.mutateAsync(formData)
    reset()
    setOpen(false)
  }

  // Helper: extract the usable ID regardless of which field the backend returns
  const getDeptId = (row: Department) => row.department_id ?? row.id ?? row.department_code

  // Determine which departments are "system" (pre-seeded by the platform).
  // The backend doesn't return an is_system field, so we infer it from created_at:
  // all departments created on the earliest date in the list are the platform seed batch.
  const depts = data?.departments || []
  const seedDate = depts.reduce<string | null>((min, d) => {
    const date = d.created_at?.substring(0, 10) ?? null
    if (!date) return min
    return !min || date < min ? date : min
  }, null)
  const isSystem = (d: Department) => !!seedDate && d.created_at?.substring(0, 10) === seedDate

  const columns: Column<Department>[] = [
    {
      key: "type",
      header: "Type",
      cell: (row) => isSystem(row) ? (
        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
          <Lock className="h-3 w-3" /> System
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-violet-100 text-violet-700 border border-violet-200">
          <UserCog className="h-3 w-3" /> Custom
        </span>
      ),
    },
    {
      key: "code",
      header: "Code",
      cell: (row) => (
        <span className="font-mono text-xs font-semibold bg-muted px-2 py-1 rounded">
          {row.department_code}
        </span>
      ),
    },
    {
      key: "name",
      header: "Department Name",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.department_name}</span>
          {isSystem(row) && (
            <span className="text-xs text-muted-foreground italic">(pre-loaded)</span>
          )}
        </div>
      ),
    },
    {
      key: "description",
      header: "Description",
      cell: (row) => (
        <span className="text-sm text-muted-foreground line-clamp-1">{row.description || "—"}</span>
      ),
    },
    {
      key: "ai",
      header: "AI Config",
      cell: (row) => (
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
          row.initial_prompt && row.system_prompt
            ? "bg-purple-100 text-purple-700"
            : "bg-amber-100 text-amber-700"
        }`}>
          <Brain className="h-3 w-3" />
          {row.initial_prompt && row.system_prompt ? "Configured" : "Not set"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
          row.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
        }`}>
          {row.is_active ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      cell: (row) => (
        <Link href={`/admin/departments/${getDeptId(row)}`}>
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
            View <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Departments"
        description="Manage organizational departments — each department is an AI agent context"
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Department
          </Button>
        }
      />

      {!isLoading && (!data?.departments || data.departments.length === 0) ? (
        <EmptyState
          icon={Building2}
          title="No departments yet"
          description="Create your first department to get started with the annual report process"
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add Department
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={depts}
          isLoading={isLoading}
          emptyMessage="No departments found"
        />
      )}

      {/* Create Department Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Department</DialogTitle>
            <p className="text-sm text-muted-foreground">
              The AI agent context for this department will be configured automatically.
            </p>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Organizational Info
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Department Code <span className="text-destructive">*</span></Label>
                  <Input
                    {...register("department_code")}
                    placeholder="FIN, HR, MKT"
                    className="uppercase"
                  />
                  {errors.department_code && (
                    <p className="text-xs text-destructive">{errors.department_code.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Department Name <span className="text-destructive">*</span></Label>
                  <Input
                    {...register("department_name")}
                    placeholder="Finance, Human Resources..."
                  />
                  {errors.department_name && (
                    <p className="text-xs text-destructive">{errors.department_name.message}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Textarea
                  {...register("description")}
                  placeholder="Brief description of this department's role..."
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => { reset(); setOpen(false) }}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Department"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
