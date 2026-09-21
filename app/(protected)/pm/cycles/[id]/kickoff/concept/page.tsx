"use client"

import { use, useEffect } from "react"
import { useRouter } from "next/navigation"
import { PageLoader } from "@/components/ui/spinner"

/**
 * The concept messages used to live here, on their own screen.
 *
 * They don't any more: each message is written for one area of focus and now
 * sits inside that area's card on the Strategic Direction screen, written in
 * the same run as the brief. Splitting them across two screens meant the client
 * could only ever be shown half the work at a time.
 *
 * This stays as a redirect rather than being deleted — the route is in browser
 * history, in notification deep links and in anything a PM has bookmarked, and
 * a dead link is a worse answer than the right page.
 */
export default function ConceptMessagesRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()

  useEffect(() => {
    router.replace(`/pm/cycles/${id}/kickoff/review`)
  }, [id, router])

  return <PageLoader />
}
