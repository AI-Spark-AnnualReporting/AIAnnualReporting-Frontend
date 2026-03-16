"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useAuth } from "@/contexts/AuthContext"
import { authApi } from "@/lib/api/auth"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getInitials } from "@/lib/utils"
import { USER_ROLES } from "@/lib/constants"
import { toast } from "sonner"

const pwSchema = z.object({
  current_password: z.string().min(1, "Required"),
  new_password: z.string().min(8, "At least 8 characters"),
  confirm: z.string(),
}).refine(d => d.new_password === d.confirm, { message: "Passwords don't match", path: ["confirm"] })

type PwForm = z.infer<typeof pwSchema>

export default function ProfilePage() {
  const { user } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PwForm>({ resolver: zodResolver(pwSchema) })

  if (!user) return null

  const onChangePassword = async (data: PwForm) => {
    setIsLoading(true)
    try {
      await authApi.changePassword({ current_password: data.current_password, new_password: data.new_password })
      toast.success("Password changed successfully")
      reset()
    } catch (err: unknown) {
      const error = err as { message?: string }
      toast.error(error?.message || "Failed to change password")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader title="Profile" description="Manage your account and security settings" />

      {/* Profile card */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
            {getInitials(user.full_name)}
          </div>
          <div>
            <p className="text-lg font-semibold">{user.full_name}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {USER_ROLES[user.role as keyof typeof USER_ROLES]?.label}
              {user.department && ` · ${user.department}`}
            </p>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-base font-semibold mb-4">Change Password</h2>
        <form onSubmit={handleSubmit(onChangePassword)} className="space-y-4 max-w-sm">
          <div className="space-y-2">
            <Label>Current Password</Label>
            <Input type="password" {...register("current_password")} />
            {errors.current_password && <p className="text-xs text-destructive">{errors.current_password.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>New Password</Label>
            <Input type="password" {...register("new_password")} />
            {errors.new_password && <p className="text-xs text-destructive">{errors.new_password.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Confirm New Password</Label>
            <Input type="password" {...register("confirm")} />
            {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
          </div>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving..." : "Update Password"}
          </Button>
        </form>
      </div>
    </div>
  )
}
