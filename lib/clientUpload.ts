/**
 * Client share-link uploads: the size limit, the check before sending, and the
 * message shown when an upload fails (feedback F19 — a 14 MB file "failed under
 * the 20 MB limit with no clear error", and nobody knew the limit was per file).
 */

/** Largest file a client can attach, per file. Same as the server's
 *  MAX_FILE_SIZE_MB (AIAnnualReporting .env), which checks it again. */
export const MAX_CLIENT_FILE_MB = 20

/** How long the page waits for one upload. The server now replies as soon as
 *  the file is stored (reading it happens afterwards), so this only has to
 *  cover sending up to 20 MB on a slow connection. */
export const CLIENT_UPLOAD_TIMEOUT_MS = 120_000

/** The "too big" message, or null when the file is within the limit. */
export function fileTooBigMessage(file: { name: string; size: number }): string | null {
  const sizeMb = file.size / (1024 * 1024)
  if (sizeMb <= MAX_CLIENT_FILE_MB) return null
  return (
    `${file.name} is ${sizeMb.toFixed(1)} MB. Each file can be up to ${MAX_CLIENT_FILE_MB} MB — ` +
    "please upload a smaller or compressed version."
  )
}

/** The shape of an axios error, as far as this file needs it. */
interface UploadError {
  code?: string
  response?: { status?: number; data?: { detail?: unknown } }
}

/** What to tell the client when an upload failed, in plain words. The server's
 *  own reason (wrong type, wrong language, too big) wins when there is one. */
export function uploadErrorMessage(error: unknown, filename: string): string {
  const err = (error ?? {}) as UploadError
  const detail = err.response?.data?.detail
  if (typeof detail === "string" && detail.trim()) return detail
  if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
    return `Uploading ${filename} took too long. Check your connection and try again.`
  }
  if (!err.response) {
    return `We couldn't reach the server to upload ${filename}. Check your connection and try again.`
  }
  if (err.response.status === 413) {
    return `${filename} is too large. Each file can be up to ${MAX_CLIENT_FILE_MB} MB.`
  }
  return `Couldn't upload ${filename}. Please try again.`
}
