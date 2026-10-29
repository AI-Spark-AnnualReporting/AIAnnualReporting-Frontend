"use client"

import { use } from "react"
import { KickoffDirectionScreen } from "@/components/pm/kickoff-direction-screen"

/**
 * Step 3 — the areas of focus and their concept messages.
 *
 * This route used to redirect here-to-there: the three parts were one bundle
 * on step 2, so there was nothing of its own to show. The client sign-off
 * split them in two -- the brief is approved first, and approving it is what
 * writes these -- so the screen exists again, and old links land on the right
 * thing rather than a redirect.
 *
 * Opening it before the brief is signed off sends you back to step 2: the
 * areas genuinely do not exist yet, and a screen with nothing on it is a worse
 * answer than being told why.
 */
export default function AreasOfFocusPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return <KickoffDirectionScreen id={id} step={3} />
}
