"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, ShieldCheck, X } from "lucide-react"

import { RouteGuard } from "@/components/auth/RouteGuard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/ui/page-header"
import { Textarea } from "@/components/ui/textarea"
import { PreviousValidationsList } from "@/components/report/PreviousValidationsList"
import { useStartExternalValidation } from "@/hooks/useReportBuilder"

/* Annual Report Validator: validate an EXTERNAL annual report, one made
   outside this system.

   Opened from Centriyon's sidebar (Spark). Everything the checks need comes
   from this form - the report, its strategic brief, its concept messages and
   its tone - because an external report belongs to no company here. All four
   are required. Submitting starts a background job and moves to its run page,
   which polls it. */
export default function AnnualReportValidatorPage() {
  return (
    <RouteGuard allowedRoles={["admin"]}>
      <ValidatorForm />
    </RouteGuard>
  )
}

const ACCEPT = ".pdf,.docx"
const MAX_CONCEPTS = 5

interface ConceptRow {
  message: string
}

function ValidatorForm() {
  const router = useRouter()
  const start = useStartExternalValidation()

  const [report, setReport] = useState<File | null>(null)
  const [brief, setBrief] = useState("")
  const [briefFile, setBriefFile] = useState<File | null>(null)
  const [conceptsFromFile, setConceptsFromFile] = useState(false)
  const [concepts, setConcepts] = useState<ConceptRow[]>([{ message: "" }])
  const [conceptFile, setConceptFile] = useState<File | null>(null)
  const [toneText, setToneText] = useState("")
  const [toneFile, setToneFile] = useState<File | null>(null)

  // No title to type any more - the backend draws a short one from the
  // message itself when none is given, so readiness only needs the message.
  const typedConcepts = concepts.filter((c) => c.message.trim())
  const briefReady = brief.trim() !== "" || briefFile !== null
  const conceptsReady = conceptsFromFile ? conceptFile !== null : typedConcepts.length > 0
  const toneReady = toneText.trim() !== "" || toneFile !== null
  const canRun = !!report && briefReady && conceptsReady && toneReady && !start.isPending

  function updateConcept(index: number, change: Partial<ConceptRow>) {
    setConcepts(concepts.map((c, i) => (i === index ? { ...c, ...change } : c)))
  }

  function run() {
    if (!report) return
    start.mutate(
      {
        report,
        brief: brief.trim(),
        briefFile: brief.trim() ? null : briefFile,
        concepts: conceptsFromFile ? [] : typedConcepts,
        conceptFile: conceptsFromFile ? conceptFile : null,
        toneText: toneText.trim(),
        toneFile: toneText.trim() ? null : toneFile,
      },
      {
        onSuccess: (data) => router.push(`/pm/annual-report-validator/runs/${data.job_id}`),
      },
    )
  }

  return (
    <div className="w-full space-y-6 p-6">
      <PageHeader
        title="Annual Report Validator"
        description="Validate an external annual report against its strategic brief, concept messages and tone. Long reports take a few minutes; you can leave the run page open or come back to it."
      />

      <Field label="Annual report" hint="PDF or DOCX. Findings point to page ranges.">
        <Input type="file" accept={ACCEPT} onChange={(e) => setReport(e.target.files?.[0] ?? null)} />
      </Field>

      <Field
        label="Strategic brief"
        hint="Paste it, or upload it as a file. Checks whether the report delivers what the brief asked for."
      >
        <div className="space-y-2">
          <Textarea
            rows={5}
            placeholder="Paste the strategic brief…"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />
          {!brief.trim() && (
            <Input type="file" accept={ACCEPT} onChange={(e) => setBriefFile(e.target.files?.[0] ?? null)} />
          )}
        </div>
      </Field>

      <Field
        label="Concept messages"
        hint={`Type up to ${MAX_CONCEPTS} (the first is the primary message), or upload a file and the AI reads them out of it.`}
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              variant={conceptsFromFile ? "outline" : "default"}
              size="sm"
              onClick={() => setConceptsFromFile(false)}
            >
              Type them
            </Button>
            <Button
              variant={conceptsFromFile ? "default" : "outline"}
              size="sm"
              onClick={() => setConceptsFromFile(true)}
            >
              Upload a file
            </Button>
          </div>

          {conceptsFromFile ? (
            <Input type="file" accept={ACCEPT} onChange={(e) => setConceptFile(e.target.files?.[0] ?? null)} />
          ) : (
            <div className="space-y-2">
              {concepts.map((c, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-2 w-16 shrink-0 text-xs text-slate-400">
                    {i === 0 ? "Primary" : "Secondary"}
                  </span>
                  <Textarea
                    rows={2}
                    placeholder="The message, in a sentence or two"
                    value={c.message}
                    onChange={(e) => updateConcept(i, { message: e.target.value })}
                    className="flex-1"
                  />
                  {concepts.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove"
                      onClick={() => setConcepts(concepts.filter((_, j) => j !== i))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {concepts.length < MAX_CONCEPTS && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConcepts([...concepts, { message: "" }])}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add concept message
                </Button>
              )}
            </div>
          )}
        </div>
      </Field>

      <Field
        label="Tone"
        hint="Paste the company's house-style guide, or upload it as a file. The AI reads out the rules it states - voice, register, banned and preferred words, do's and don'ts."
      >
        <div className="space-y-2">
          <Textarea
            rows={6}
            placeholder="Paste the house-style guide…"
            value={toneText}
            onChange={(e) => setToneText(e.target.value)}
          />
          {!toneText.trim() && (
            <Input type="file" accept={ACCEPT} onChange={(e) => setToneFile(e.target.files?.[0] ?? null)} />
          )}
        </div>
      </Field>

      <div className="flex items-center justify-end gap-3">
        {!canRun && !start.isPending && (
          <p className="text-xs text-slate-400">
            The report, brief, concept messages and a tone guide are all required.
          </p>
        )}
        <Button onClick={run} disabled={!canRun}>
          <ShieldCheck className="mr-2 h-4 w-4" />
          {start.isPending ? "Uploading…" : "Validate report"}
        </Button>
      </div>

      <PreviousValidationsList />
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-xl border bg-white p-4">
      <Label className="text-sm font-semibold">{label}</Label>
      <p className="text-xs text-slate-500">{hint}</p>
      <div className="pt-1">{children}</div>
    </div>
  )
}

