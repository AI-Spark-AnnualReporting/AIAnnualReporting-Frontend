"use client"

import { use } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Construction } from "lucide-react"

/* Placeholder landing after the brief is approved and the questions deadline is
   set. The real post-approval destination isn't built yet — this stands in so
   the flow completes end to end. */
export default function KickoffDonePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-md rounded-2xl border bg-card p-10 text-center shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
          <Construction className="h-7 w-7" />
        </span>
        <h1 className="mt-5 text-xl font-bold tracking-tight text-foreground">
          Under development
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your strategic brief is approved and the questions deadline is set.
          The next step in this flow is still being built — check back soon.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link href={`/pm/cycles/${id}`}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" /> Back to cycle
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
