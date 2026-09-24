"use client"

import { use } from "react"

import { RouteGuard } from "@/components/auth/RouteGuard"
import { CreateDesignShell } from "@/components/report/create-design/CreateDesignShell"

export default function CreateDesignPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return (
    <RouteGuard allowedRoles={["project_manager", "admin"]}>
      <CreateDesignShell cycleId={id} />
    </RouteGuard>
  )
}
