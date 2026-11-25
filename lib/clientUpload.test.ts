/**
 * Self-check for the client upload helpers. No framework — run it with:
 *   node lib/clientUpload.test.ts
 */

import assert from "node:assert/strict"
import { MAX_CLIENT_FILE_MB, fileTooBigMessage, uploadErrorMessage } from "./clientUpload.ts"

const MB = 1024 * 1024

// Size check before sending: 14 MB passes (the F19 case), over 20 MB is stopped.
assert.equal(fileTooBigMessage({ name: "brief.pdf", size: 14 * MB }), null)
assert.equal(fileTooBigMessage({ name: "brief.pdf", size: MAX_CLIENT_FILE_MB * MB }), null)
assert.equal(
  fileTooBigMessage({ name: "Infra AR 2025.pdf", size: 57 * MB }),
  "Infra AR 2025.pdf is 57.0 MB. Each file can be up to 20 MB — please upload a smaller or compressed version.",
)

// The server's reason wins (wrong language, wrong type, too big).
assert.equal(
  uploadErrorMessage({ response: { status: 400, data: { detail: "This document doesn't appear to be in Arabic." } } }, "a.pdf"),
  "This document doesn't appear to be in Arabic.",
)

// Timeout and no connection each say what happened — never "up to 20 MB" for a 14 MB file.
assert.equal(
  uploadErrorMessage({ code: "ECONNABORTED" }, "brief.pdf"),
  "Uploading brief.pdf took too long. Check your connection and try again.",
)
assert.equal(
  uploadErrorMessage({ code: "ERR_NETWORK" }, "brief.pdf"),
  "We couldn't reach the server to upload brief.pdf. Check your connection and try again.",
)
assert.equal(
  uploadErrorMessage({ response: { status: 413, data: {} } }, "big.pdf"),
  "big.pdf is too large. Each file can be up to 20 MB.",
)
assert.equal(
  uploadErrorMessage({ response: { status: 500, data: { detail: "" } } }, "a.pdf"),
  "Couldn't upload a.pdf. Please try again.",
)
assert.equal(uploadErrorMessage(undefined, "a.pdf"), "We couldn't reach the server to upload a.pdf. Check your connection and try again.")

console.log("clientUpload: all checks passed")
