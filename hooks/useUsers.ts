import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { usersApi, UsersFilters, CreateUserPayload, UpdateUserPayload } from "@/lib/api/users"
import { toast } from "sonner"

export function useUsers(filters: UsersFilters = {}) {
  return useQuery({
    queryKey: ["users", filters],
    queryFn: () => usersApi.list(filters),
  })
}

export function useUserStats() {
  return useQuery({
    queryKey: ["users", "stats"],
    queryFn: () => usersApi.stats(),
  })
}

export function useAdminStats() {
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => usersApi.adminStats(),
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateUserPayload) => usersApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] })
      toast.success("User created successfully")
    },
    // Error is surfaced inline in the form — no toast needed here
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: UpdateUserPayload }) =>
      usersApi.update(userId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] })
      toast.success("User updated successfully")
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to update user")
    },
  })
}

export function useActivateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => usersApi.activate(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] })
      toast.success("User activated")
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to activate user")
    },
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => usersApi.delete(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] })
      toast.success("User deleted")
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to delete user")
    },
  })
}
