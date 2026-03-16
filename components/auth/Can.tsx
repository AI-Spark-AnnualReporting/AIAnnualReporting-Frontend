"use client"

import { useAuth } from "@/contexts/AuthContext"
import { UserRole } from "@/types"

interface CanProps {
  role?: UserRole | UserRole[]
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function Can({ role, children, fallback = null }: CanProps) {
  const { user } = useAuth()

  if (!user) return <>{fallback}</>

  if (!role) return <>{children}</>

  const roles = Array.isArray(role) ? role : [role]

  if (!roles.includes(user.role)) return <>{fallback}</>

  return <>{children}</>
}
