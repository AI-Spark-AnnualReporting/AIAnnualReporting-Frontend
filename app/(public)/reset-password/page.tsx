"use client"

import { Suspense, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useSearchParams, useRouter } from "next/navigation"
import { authApi } from "@/lib/api/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sparkles } from "lucide-react"
import { toast } from "sonner"

const schema = z.object({
  password: z.string().min(8, "At least 8 characters"),
  confirm: z.string(),
}).refine(d => d.password === d.confirm, { message: "Passwords don't match", path: ["confirm"] })

type Form = z.infer<typeof schema>

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get("token") || ""
  const [isLoading, setIsLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: Form) => {
    if (!token) { toast.error("Invalid or expired reset link"); return }
    setIsLoading(true)
    try {
      await authApi.confirmPasswordReset({ token, new_password: data.password })
      toast.success("Password reset successfully")
      router.push("/login")
    } catch {
      toast.error("Failed to reset password. The link may have expired.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-2">
        <Label>New Password</Label>
        <Input type="password" {...register("password")} placeholder="Minimum 8 characters" />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>
      <div className="space-y-2">
        <Label>Confirm Password</Label>
        <Input type="password" {...register("confirm")} placeholder="Repeat your password" />
        {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Saving..." : "Reset Password"}
      </Button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border bg-card shadow-xl p-8">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Set New Password</h1>
          <p className="mt-1 text-sm text-muted-foreground">Choose a strong password for your account</p>
        </div>
        <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-muted" />}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  )
}
