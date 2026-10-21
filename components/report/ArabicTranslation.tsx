"use client"

import type { ReactNode } from "react"
import { Noto_Naskh_Arabic } from "next/font/google"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { AiLoadingScreen } from "@/components/report/AiLoadingScreen"
import { Button } from "@/components/ui/button"
import { useTranslationJob } from "@/hooks/useReportBuilder"
import type { AssembledReport } from "@/lib/api/annual-design"

// The Arabic edition's font. The report's own design fonts are Latin-only, so
// Arabic text otherwise falls back to whatever the browser has.
const arabicFont = Noto_Naskh_Arabic({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-arabic",
})

const MILESTONES = [
  "Preparing the translation brief",
  "Translating the sections",
  "Putting the Arabic report together",
]

/**
 * Wraps the Arabic report: right-to-left, and every piece of text in the
 * Arabic font. !important because the report sheet sets its design fonts on
 * each heading and paragraph, which would otherwise win.
 */
export function ArabicEdition({ children }: { children: ReactNode }) {
  return (
    <div dir="rtl" lang="ar" className={`arabic-edition ${arabicFont.variable}`}>
      <style>{`
        .arabic-edition .report-sheet,
        .arabic-edition .report-sheet * {
          font-family: var(--font-arabic), serif !important;
        }
      `}</style>
      {children}
    </div>
  )
}

/**
 * The report's design with the Arabic cover lines in place of the English
 * ones, for the Arabic view. Logo, colours and layout stay the same. The date
 * line is today's date, as on the English cover, written in Arabic.
 *
 * Returns the design unchanged when there is no design or no Arabic cover
 * (a translation saved before covers were translated).
 */
export function withArabicCover(
  assembled: AssembledReport | undefined,
  coverValues: Record<string, string> | null | undefined,
): AssembledReport | undefined {
  if (!assembled?.cover || !coverValues) return assembled
  const today = new Date().toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  return {
    ...assembled,
    content_language: "arabic",
    cover: {
      ...assembled.cover,
      values: {
        ...assembled.cover.values,
        ...coverValues,
        prepared_on: today,
      },
    },
  }
}

interface TranslationRunProps {
  jobId: string
  /** The run completed and the loader finished; must be stable (useCallback). */
  onFinished: () => void
  /** Start again from the beginning. */
  onRetry: () => void
  /** Close the failure card and go back to the report. */
  onClose: () => void
}

/** Follows one translation run: a progress loader, then done or a failure card. */
export function TranslationRun({ jobId, onFinished, onRetry, onClose }: TranslationRunProps) {
  const { data: job } = useTranslationJob(jobId)

  if (job?.status === "failed" || job?.status === "timeout") {
    return (
      <TranslationFailedCard
        message={job.error || "The translation did not finish. Please try again."}
        onRetry={onRetry}
        onClose={onClose}
      />
    )
  }

  const done = job?.done ?? 0
  const total = job?.total ?? 0
  const translating = job?.stage === "translate" && total > 0
  // The brief is a small first step; the sections are the rest of the bar.
  const progress = translating ? 5 + Math.round((done / total) * 90) : 3

  return (
    <div className="fixed inset-0 z-[1400] overflow-y-auto">
      <AiLoadingScreen
        title="Translating your report into Arabic"
        subtitle={
          translating
            ? "Each section is translated with the same terms and style."
            : "Reading the whole report to fix names, terms and style first."
        }
        milestones={MILESTONES}
        controlledProgress={progress}
        progressCaption={translating ? `${done} of ${total} sections` : "Preparing the translation brief"}
        activeMilestone={translating ? 1 : 0}
        done={job?.status === "completed"}
        doneTitle="Your Arabic report is ready"
        doneSubtitle="Opening it now."
        onDone={onFinished}
      />
    </div>
  )
}

interface TranslationFailedCardProps {
  message: string
  onRetry: () => void
  onClose: () => void
}

// Same look as the assemble failure card, on the loader's backdrop.
function TranslationFailedCard({ message, onRetry, onClose }: TranslationFailedCardProps) {
  return (
    <div
      role="alertdialog"
      aria-labelledby="translation-failed-title"
      className="fixed inset-0 z-[1400] flex items-center justify-center overflow-y-auto p-5"
      style={{
        background:
          "radial-gradient(120% 80% at 50% -10%, #EEEFFE 0%, #F4F5FB 45%, #F4F5FB 100%)",
      }}
    >
      <div className="w-full max-w-[520px] rounded-2xl border border-[#E2E4F0] bg-white px-8 py-9 text-center shadow-[0_30px_70px_rgba(20,22,40,.14)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
        </div>
        <h2 id="translation-failed-title" className="mt-4 text-xl font-bold text-slate-900">
          We couldn&apos;t translate the report
        </h2>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <p className="mt-1 text-xs text-slate-400">
          Nothing was saved. Any earlier Arabic version is unchanged.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={onClose}>
            Back to report
          </Button>
          <Button onClick={onRetry} className="bg-indigo-600 text-white hover:bg-indigo-700">
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    </div>
  )
}
