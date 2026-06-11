import { useState } from "react"
import { ContentLanguage } from "@/types"
import { documentsApi } from "@/lib/api/documents"
import { documentLanguageWarning } from "@/lib/lang"

export type DocLang = "checking" | "ok" | "bad"

export interface CheckedDoc {
  file: File
  lang: DocLang
  detected?: ContentLanguage
}

// Tracks the language status of each picked document independently so a
// wrong-language file can never be "forgotten" when more files are added.
// Each file is verified against the cycle language via the backend (works for
// PDF/DOCX too). Used by every multi-file upload dialog.
export function useDocLanguageCheck(cycleLang: ContentLanguage) {
  const [docs, setDocs] = useState<CheckedDoc[]>([])

  const _check = (files: File[]) => {
    files.forEach((file) => {
      documentsApi
        .checkLanguage(file, cycleLang)
        .then((res) => {
          const detected =
            res.detected_language === "arabic" || res.detected_language === "english"
              ? res.detected_language
              : undefined
          // Update THIS file only, by reference — never touch the others.
          setDocs((prev) =>
            prev.map((d) =>
              d.file === file ? { ...d, lang: res.matches ? "ok" : "bad", detected } : d,
            ),
          )
        })
        .catch(() => {
          // Fail open — the backend gate still protects at submit time.
          setDocs((prev) =>
            prev.map((d) => (d.file === file ? { ...d, lang: "ok" } : d)),
          )
        })
    })
  }

  // Append newly picked files as "checking", then verify each.
  const addFiles = (files: File[]) => {
    if (files.length === 0) return
    setDocs((prev) => [...prev, ...files.map((file) => ({ file, lang: "checking" as DocLang }))])
    _check(files)
  }

  const removeAt = (idx: number) =>
    setDocs((prev) => prev.filter((_, i) => i !== idx))

  const reset = () => setDocs([])

  // Replace the whole list (e.g. restoring files after a failed upload) and re-verify.
  const setAll = (files: File[]) => {
    setDocs(files.map((file) => ({ file, lang: "checking" as DocLang })))
    _check(files)
  }

  const files = docs.map((d) => d.file)
  const anyChecking = docs.some((d) => d.lang === "checking")
  const badDocs = docs.filter((d) => d.lang === "bad")
  // Disable the proceed button until every file is verified and green.
  const blocked = anyChecking || badDocs.length > 0
  const warning =
    badDocs.length > 0 ? documentLanguageWarning(cycleLang, badDocs[0].detected) : null

  return { docs, files, addFiles, removeAt, reset, setAll, anyChecking, badDocs, blocked, warning }
}
