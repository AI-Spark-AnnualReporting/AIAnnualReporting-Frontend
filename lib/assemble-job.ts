import { pmApi } from "@/lib/api/pm"

// Assembling runs in the background on the server: the click only STARTS it
// and gets a job id back. The job is saved on the server (running, then
// completed or failed), so the page asks about that job - never guessing from
// the report's save time, which other saves (an Undo, an Ignore) move too.
const POLL_INTERVAL_MS = 3_000
// A safety net only: the server itself reports a job that ran too long as
// failed. A normal run takes one to two minutes.
const POLL_GIVE_UP_MS = 10 * 60_000

/**
 * Wait for a background assemble job to finish.
 *
 * A failed check (a network blip, the dev server restarting) is just "not
 * yet": the run lives on the server, not in this request.
 *
 * @param jobId       From `pmApi.startAssemble`.
 * @param isCancelled Checked between polls; true stops waiting (the PM left).
 * @returns true once the job completed, false if cancelled.
 * @throws Error with the server's reason when the job failed, or when it
 *         never finished in time.
 */
export async function waitForAssembleJob(
  jobId: string,
  isCancelled: () => boolean = () => false,
): Promise<boolean> {
  const giveUpAt = Date.now() + POLL_GIVE_UP_MS
  while (Date.now() < giveUpAt) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    if (isCancelled()) return false
    let job
    try {
      job = await pmApi.getAssembleJob(jobId)
    } catch {
      continue
    }
    if (job.status === "completed") return true
    if (job.status === "failed") {
      throw new Error(job.error || "Assembling failed. Please try again.")
    }
  }
  throw new Error("Assembling didn't finish. It may have hit an error. Please try again.")
}
