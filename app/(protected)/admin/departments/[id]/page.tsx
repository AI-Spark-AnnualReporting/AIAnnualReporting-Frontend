"use client"

import { use, useState } from "react"
import { Input } from "@/components/ui/input"
import { useDepartment, useUpdateDepartment } from "@/hooks/useDepartments"
import { useUsers } from "@/hooks/useUsers"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DataTable, Column } from "@/components/ui/data-table"
import { PageSkeleton } from "@/components/ui/skeletons"
import { EmptyState } from "@/components/ui/empty-state"
import { User } from "@/types"
import {
  ArrowLeft, Brain, Building2, Users, Edit3, Save, X,
  CheckCircle2, Info, ChevronDown, ChevronUp, Lock, AlertCircle,
} from "lucide-react"
import Link from "next/link"
import { formatDate } from "@/lib/utils"
import { toast } from "sonner"

export default function DepartmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { data, isLoading, isError, refetch } = useDepartment(id)
  const { data: usersData } = useUsers()
  const updateMutation = useUpdateDepartment()

  const [editingPrompts, setEditingPrompts] = useState(false)
  const [initialPrompt, setInitialPrompt] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [promptsOpen, setPromptsOpen] = useState(true)

  // Inline editing for department name / description
  const [editingInfo, setEditingInfo] = useState(false)
  const [editName, setEditName] = useState("")
  const [editDescription, setEditDescription] = useState("")

  if (isLoading) return <PageSkeleton />

  if (isError) return (
    <div className="max-w-lg space-y-4">
      <Link href="/admin/departments">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Departments
        </Button>
      </Link>
      <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-5">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-destructive">Could not load department</p>
          <p className="text-sm text-muted-foreground mt-1">
            The department detail could not be retrieved. This may be a temporary issue.
          </p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => refetch()}>
            Try Again
          </Button>
        </div>
      </div>
    </div>
  )

  const dept = data?.department
  if (!dept) return (
    <EmptyState title="Department not found" description="This department does not exist." />
  )

  // Filter users assigned to this department (by department_name or department_code)
  const allUsers = usersData?.users || []
  const assignedUsers = allUsers.filter(
    (u) =>
      u.department === dept.department_name ||
      u.department === dept.department_code ||
      u.department === dept.id
  )

  const handleEditPrompts = () => {
    setInitialPrompt(dept.initial_prompt || "")
    setSystemPrompt(dept.system_prompt || "")
    setEditingPrompts(true)
  }

  const handleSavePrompts = async () => {
    try {
      await updateMutation.mutateAsync({
        deptId: id,
        data: { initial_prompt: initialPrompt, system_prompt: systemPrompt },
      })
      setEditingPrompts(false)
      refetch()
    } catch {
      toast.error("Failed to save prompts")
    }
  }

  const handleEditInfo = () => {
    setEditName(dept.department_name)
    setEditDescription(dept.description || "")
    setEditingInfo(true)
  }

  const handleSaveInfo = async () => {
    try {
      await updateMutation.mutateAsync({
        deptId: id,
        data: { department_name: editName.trim(), description: editDescription.trim() },
      })
      setEditingInfo(false)
      refetch()
    } catch {
      toast.error("Failed to save department details")
    }
  }

  const userColumns: Column<User>[] = [
    {
      key: "name",
      header: "Name",
      cell: (row) => <span className="font-medium">{row.full_name}</span>,
    },
    {
      key: "email",
      header: "Email",
      cell: (row) => <span className="text-sm text-muted-foreground">{row.email}</span>,
    },
    {
      key: "role",
      header: "Role",
      cell: (row) => (
        <span className="capitalize text-sm">
          {row.role.replace("_", " ")}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
          row.status === "active"
            ? "bg-green-100 text-green-700"
            : row.status === "pending"
            ? "bg-amber-100 text-amber-700"
            : "bg-gray-100 text-gray-600"
        }`}>
          {row.status}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/departments">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          title={dept.department_name}
          description={`Department Code: ${dept.department_code}`}
        />
      </div>

      {/* System department notice */}
      {dept.is_system && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <Lock className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-800">System Department</p>
            <p className="text-xs text-blue-700 mt-0.5">
              This department was pre-loaded by the platform. You can configure its AI agent prompts,
              but its code and core identity cannot be removed.
            </p>
          </div>
          <span className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
            <Lock className="h-3 w-3" /> System
          </span>
        </div>
      )}

      {/* Department Info Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Code</p>
          <p className="font-mono font-bold text-lg">{dept.department_code}</p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Status</p>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
            dept.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
          }`}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            {dept.is_active ? "Active" : "Inactive"}
          </span>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Created</p>
          <p className="font-medium text-sm">{formatDate(dept.created_at)}</p>
        </div>
      </div>

      {/* Department Name & Description — editable */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Department Details
          </p>
          {!editingInfo && (
            <Button variant="outline" size="sm" onClick={handleEditInfo}>
              <Edit3 className="h-3.5 w-3.5 mr-1" /> Edit Details
            </Button>
          )}
        </div>

        {editingInfo ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Department Name <span className="text-destructive">*</span></Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="e.g. Finance"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Brief description of this department's role in the annual report..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setEditingInfo(false)}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveInfo}
                disabled={updateMutation.isPending || !editName.trim()}
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                {updateMutation.isPending ? "Saving..." : "Save Details"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div>
              <p className="text-xs text-muted-foreground">Name</p>
              <p className="font-medium">{dept.department_name}</p>
            </div>
            {dept.description ? (
              <div>
                <p className="text-xs text-muted-foreground">Description</p>
                <p className="text-sm leading-relaxed">{dept.description}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No description set.</p>
            )}
          </div>
        )}
      </div>


      {/* Assigned Users Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" />
            Assigned Users
            <span className="text-xs font-normal text-muted-foreground">
              ({assignedUsers.length} user{assignedUsers.length !== 1 ? "s" : ""})
            </span>
          </h2>
          <Link href={`/admin/users?department=${dept.department_code}`}>
            <Button variant="outline" size="sm">
              <Users className="h-3.5 w-3.5 mr-1" /> Manage Users
            </Button>
          </Link>
        </div>

        {assignedUsers.length === 0 ? (
          <div className="rounded-xl border bg-card">
            <EmptyState
              icon={Users}
              title="No users assigned"
              description={`No users are currently assigned to the ${dept.department_name} department. Assign users from the Users Management page.`}
              action={
                <Link href="/admin/users">
                  <Button variant="outline" size="sm">
                    <Users className="h-3.5 w-3.5 mr-1" /> Go to Users
                  </Button>
                </Link>
              }
            />
          </div>
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden">
            <DataTable
              columns={userColumns}
              data={assignedUsers}
              isLoading={false}
              emptyMessage="No users assigned"
            />
          </div>
        )}
      </div>

      {/* Architecture Note */}
      <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <Building2 className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700">
          <p className="font-semibold text-blue-800 mb-1">How Department Assignment Works</p>
          <p>Users are assigned to departments via their user profile. When a PM creates a session for this department in a reporting cycle, they select which user from this department will be the responsible contributor.</p>
        </div>
      </div>
    </div>
  )
}
