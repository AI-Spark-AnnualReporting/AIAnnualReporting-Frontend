"use client"

import { useState } from "react"
import {
  useUsers,
  useUserStats,
  useCreateUser,
  useUpdateUser,
  useActivateUser,
  useDeleteUser,
} from "@/hooks/useUsers"
import { useDepartments } from "@/hooks/useDepartments"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DataTable, Column } from "@/components/ui/data-table"
import { StatusBadge } from "@/components/ui/status-badge"
import { StatsCard } from "@/components/ui/stats-card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { User } from "@/types"
import { USER_ROLES } from "@/lib/constants"
import { Users, Plus, Search, UserCheck, UserX, Trash2, AlertCircle, Pencil } from "lucide-react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { formatDate } from "@/lib/utils"

const createSchema = z.object({
  full_name: z.string().min(2, "Required"),
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "At least 8 characters"),
  phone: z.string().optional(),
  role: z.enum(["admin", "project_manager", "department_user"]),
  department_id: z.string().optional(),
})
type CreateForm = z.infer<typeof createSchema>

const editSchema = z.object({
  full_name: z.string().min(2, "Required"),
})
type EditForm = z.infer<typeof editSchema>

export default function UsersPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<User | null>(null)

  const { data, isLoading } = useUsers({
    page,
    page_size: 20,
    role: roleFilter !== "all" ? roleFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
  })
  const { data: stats } = useUserStats()
  const { data: depts } = useDepartments()
  const createMutation = useCreateUser()
  const updateMutation = useUpdateUser()
  const activateMutation = useActivateUser()
  const deleteMutation = useDeleteUser()

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { role: "department_user" },
  })

  const watchedRole = watch("role")

  const {
    register: editRegister,
    handleSubmit: editHandleSubmit,
    reset: editReset,
  } = useForm<EditForm>({ resolver: zodResolver(editSchema) })

  const openEdit = (user: User) => {
    editReset({ full_name: user.full_name })
    setEditTarget(user)
  }

  const onEditSubmit = async (formData: EditForm) => {
    if (!editTarget) return
    const dept = formData.role === "department_user"
      ? depts?.departments.find((d) => d.id === formData.department_id)
      : undefined
    await updateMutation.mutateAsync({
      userId: editTarget.user_id,
      data: { full_name: formData.full_name },
    })
    setEditTarget(null)
  }

  const onCreateSubmit = async (formData: CreateForm) => {
    setCreateError(null)
    try {
      const dept = formData.role === "department_user"
        ? depts?.departments.find((d) => d.id === formData.department_id)
        : undefined
      await createMutation.mutateAsync({
        ...formData,
        department_id: dept ? formData.department_id : undefined,
        department: dept?.department_name,
      })
      reset()
      setCreateOpen(false)
    } catch (err: unknown) {
      const apiErr = err as { message?: string; details?: unknown; status?: number }
      const msg = apiErr?.message || "Failed to create user"
      const details = apiErr?.details
      const detailStr = details && typeof details === "object"
        ? JSON.stringify(details, null, 2)
        : details
      setCreateError(details ? `${msg}\n\nDetails: ${detailStr}` : msg)
    }
  }

  const filteredUsers = (data?.users || []).filter(
    (u) =>
      !search ||
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  )

  const columns: Column<User>[] = [
    {
      key: "name",
      header: "Name",
      cell: (row) => (
        <div>
          <p className="font-medium">{row.full_name}</p>
          <p className="text-xs text-muted-foreground">{row.email}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (row) => (
        <span className="text-sm">
          {USER_ROLES[row.role as keyof typeof USER_ROLES]?.label}
        </span>
      ),
    },
    {
      key: "department",
      header: "Department",
      cell: (row) => <span className="text-sm">{row.department || "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} variant="user" />,
    },
    {
      key: "created",
      header: "Created",
      cell: (row) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.created_at)}</span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      cell: (row) => (
        <div className="flex items-center gap-2">
          {row.status === "pending" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => activateMutation.mutate(row.user_id)}
              disabled={activateMutation.isPending}
              className="text-green-600 border-green-200 hover:bg-green-50 h-7 text-xs"
            >
              <UserCheck className="h-3 w-3 mr-1" />
              Activate
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openEdit(row)}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            title="Edit user"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDeleteTarget(row)}
            className="text-destructive hover:bg-destructive/10 h-7 w-7 p-0"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Manage user accounts and permissions"
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatsCard title="Total" value={stats?.total_users ?? 0} icon={Users} />
        <StatsCard title="Active" value={stats?.active_users ?? 0} icon={UserCheck} />
        <StatsCard title="Pending" value={stats?.pending_users ?? 0} icon={Users} />
        <StatsCard title="Inactive" value={stats?.inactive_users ?? 0} icon={UserX} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="project_manager">Project Manager</SelectItem>
            <SelectItem value="department_user">Department User</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filteredUsers}
        isLoading={isLoading}
        emptyMessage="No users found"
        pagination={
          data
            ? { page, pageSize: 20, total: data.total, onPageChange: setPage }
            : undefined
        }
      />

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) { setCreateError(null); reset() } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onCreateSubmit)} className="space-y-4">
            {createError && (
              <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive whitespace-pre-wrap leading-relaxed">{createError}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input {...register("full_name")} placeholder="John Doe" />
              {errors.full_name && (
                <p className="text-xs text-destructive">{errors.full_name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" {...register("email")} placeholder="john@company.com" />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                {...register("password")}
                placeholder="Minimum 8 characters"
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Phone <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                type="tel"
                {...register("phone")}
                placeholder="+1 555 000 0000"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Controller
                name="role"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(v) => { field.onChange(v); if (v !== "department_user") setValue("department_id", "") }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="project_manager">Project Manager</SelectItem>
                      <SelectItem value="department_user">Department User</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            {watchedRole === "department_user" && (
              <div className="space-y-2">
                <Label>Department</Label>
                <Controller
                  name="department_id"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value || ""} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        {depts?.departments.map((d) => (
                          <SelectItem key={d.id} value={d.id || ""}>
                            {d.department_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  reset()
                  setCreateError(null)
                  setCreateOpen(false)
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <form onSubmit={editHandleSubmit(onEditSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <input
                {...editRegister("full_name")}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Full name"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setEditTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete User"
        description={`Are you sure you want to delete ${deleteTarget?.full_name}? This action cannot be undone.`}
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteMutation.mutateAsync(deleteTarget.user_id)
            setDeleteTarget(null)
          }
        }}
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}
