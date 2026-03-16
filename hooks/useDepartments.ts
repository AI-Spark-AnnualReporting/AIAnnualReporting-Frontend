import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { departmentsApi, CreateDepartmentPayload, UpdateDepartmentPayload } from "@/lib/api/departments"
import { toast } from "sonner"

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: () => departmentsApi.list(),
  })
}

export function useDepartment(deptId: string) {
  return useQuery({
    queryKey: ["department", deptId],
    queryFn: () => departmentsApi.get(deptId),
    enabled: !!deptId,
    retry: false,
  })
}

export function useCreateDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateDepartmentPayload) => departmentsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] })
      toast.success("Department created successfully")
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to create department")
    },
  })
}

export function useUpdateDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ deptId, data }: { deptId: string; data: UpdateDepartmentPayload }) =>
      departmentsApi.update(deptId, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["department", vars.deptId] })
      qc.invalidateQueries({ queryKey: ["departments"] })
      toast.success("Department updated successfully")
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to update department")
    },
  })
}

export function useAssignUsersToDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ deptId, userIds }: { deptId: string; userIds: string[] }) =>
      departmentsApi.assignUsers(deptId, userIds),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["department", vars.deptId] })
      toast.success("Users assigned successfully")
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to assign users")
    },
  })
}
