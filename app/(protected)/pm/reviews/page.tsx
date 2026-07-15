import { redirect } from "next/navigation"

// Reviewing department submissions is now handled by each department's HOD.
// The PM no longer reviews; send any stale link to the cycles list.
export default function PMReviewsRedirect() {
  redirect("/pm/cycles")
}
