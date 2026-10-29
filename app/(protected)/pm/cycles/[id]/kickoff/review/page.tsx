"use client"

import { use } from "react"
import { KickoffDirectionScreen } from "@/components/pm/kickoff-direction-screen"

/** Step 2 — the strategic brief, on its own. It goes to the client alone,
 *  because everything on step 3 is written from whatever comes back. */
export default function StrategicBriefPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return <KickoffDirectionScreen id={id} step={2} />
}
