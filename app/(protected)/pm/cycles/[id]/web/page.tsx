"use client"

import { use } from "react"

import { RouteGuard } from "@/components/auth/RouteGuard"
import { WebShell } from "@/components/report/web/WebShell"

export default function WebPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return (
    <RouteGuard allowedRoles={["project_manager", "admin"]}>
      <WebShell cycleId={id} />
    </RouteGuard>
  )
}
