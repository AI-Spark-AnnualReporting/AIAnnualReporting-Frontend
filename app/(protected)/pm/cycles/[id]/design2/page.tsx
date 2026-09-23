"use client"

import { use } from "react"

import { RouteGuard } from "@/components/auth/RouteGuard"
import { Design2Shell } from "@/components/report/design2/Design2Shell"

export default function Design2Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return (
    <RouteGuard allowedRoles={["project_manager", "admin"]}>
      <Design2Shell cycleId={id} />
    </RouteGuard>
  )
}
