"use client"

import { useAuth } from "@/contexts/AuthContext"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { getInitials } from "@/lib/utils"
import { USER_ROLES } from "@/lib/constants"
import { centriyonLoginUrl } from "@/lib/centriyon"
import { ArrowUpRight, KeyRound } from "lucide-react"

export default function ProfilePage() {
  const { user } = useAuth()
  if (!user) return null

  const loginUrl = centriyonLoginUrl()

  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader title="Profile" description="Manage your account and security settings" />

      {/* Profile card */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-4">
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

      {/* Password & account — managed in Centriyon */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <KeyRound className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold">Password & account</h2>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              Your password and account details are managed through Centriyon.
              To change your password or update account information, head over
              to Centriyon&apos;s account settings.
            </p>
            <a
              href={loginUrl}
              className="mt-4 inline-block"
            >
              <Button variant="outline" size="sm">
                Open Centriyon
                <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
