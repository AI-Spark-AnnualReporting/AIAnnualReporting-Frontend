/**
 * One copy helper for every Copy button in the app.
 *
 * Why two methods: browsers only give pages `navigator.clipboard` on a secure
 * page (https or http://localhost). On-premises servers open the app on plain
 * http (e.g. http://192.168.1.20:3000), where it is missing. The old
 * `document.execCommand('copy')` still works there, so we fall back to it.
 */

/** Try the modern clipboard API. Returns true if the text was copied. */
async function copyWithClipboardApi(text: string): Promise<boolean> {
  const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined
  if (!clipboard || typeof clipboard.writeText !== "function") return false
  try {
    await clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Copy using a hidden textarea and execCommand('copy'). Works on plain http.
 * Puts focus back where it was, so dialogs don't lose focus. Returns true if copied.
 */
function copyWithHiddenTextarea(text: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false

  const previousFocus = document.activeElement as HTMLElement | null
  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.top = "0"
  textarea.style.left = "-9999px"
  textarea.style.opacity = "0"

  // Append inside an open dialog if there is one: Radix dialogs trap focus,
  // and a textarea outside the dialog could not be selected.
  const container = previousFocus?.closest('[role="dialog"]') ?? document.body
  container.appendChild(textarea)

  let copied = false
  try {
    textarea.focus({ preventScroll: true })
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    copied = document.execCommand("copy")
  } catch {
    copied = false
  }

  container.removeChild(textarea)
  previousFocus?.focus?.({ preventScroll: true })
  return copied
}

/** Copy text to the clipboard. Returns true if it worked, false if both methods failed. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false
  const copiedWithApi = await copyWithClipboardApi(text)
  if (copiedWithApi) return true
  return copyWithHiddenTextarea(text)
}
