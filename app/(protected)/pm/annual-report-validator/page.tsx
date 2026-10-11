"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, X } from "lucide-react"

import { RouteGuard } from "@/components/auth/RouteGuard"
import { PreviousValidationsGallery } from "@/components/validator/PreviousValidationsGallery"
import {
  DARK,
  FileDropzone,
  ModeTabs,
  MUTED,
  Section,
  SetupCard,
} from "@/components/validator/validator-ui"
import { useStartExternalValidation } from "@/hooks/useReportBuilder"

/* Annual Report Validator: validate an EXTERNAL annual report, one made
   outside this system.

   Opened from Centriyon's sidebar (Spark). Laid out exactly like admin's
   native page in Centriyon (AnnualReportValidatorPage.tsx) - same card, steps,
   drop zones and tabs - so both roles see one product. Everything the checks
   need comes from this form, because an external report belongs to no company
   here; all four inputs are required. Submitting starts a background job and
   moves to its run page, which polls it. */
export default function AnnualReportValidatorPage() {
  return (
    <RouteGuard allowedRoles={["admin"]}>
      <ValidatorForm />
    </RouteGuard>
  )
}

const ACCEPT = ".pdf,.docx"
// The report itself is DOCX only: its Word headings become the sections the
// findings point at. The backend refuses a PDF report too.
const REPORT_ACCEPT = ".docx"
const MAX_CONCEPTS = 5

interface ConceptRow {
  message: string
}

/** The server's reason for refusing the start, or a plain fallback.
 *  apiClient's interceptor rejects with `{ message, status, … }`, the
 *  server's own text already in `message` - not the raw axios error. */
function startError(err: unknown): string {
  const message = (err as { message?: unknown })?.message
  return typeof message === "string" && message.trim() ? message : "Couldn't start the validation"
}

function ValidatorForm() {
  const router = useRouter()
  const start = useStartExternalValidation()

  const [report, setReport] = useState<File | null>(null)
  const [brief, setBrief] = useState("")
  const [briefFile, setBriefFile] = useState<File | null>(null)
  const [briefFromFile, setBriefFromFile] = useState(false)
  const [conceptsFromFile, setConceptsFromFile] = useState(false)
  const [concepts, setConcepts] = useState<ConceptRow[]>([{ message: "" }])
  const [conceptFile, setConceptFile] = useState<File | null>(null)
  const [toneText, setToneText] = useState("")
  const [toneFile, setToneFile] = useState<File | null>(null)
  const [toneFromFile, setToneFromFile] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [setupExpanded, setSetupExpanded] = useState(true)

  // No title to type - the backend draws a short one from the message itself.
  const typedConcepts = concepts.filter((c) => c.message.trim())
  // Like concept messages, whichever tab is open is the one input that
  // counts - text typed on the other tab is kept, not sent.
  const briefReady = briefFromFile ? briefFile !== null : brief.trim() !== ""
  const conceptsReady = conceptsFromFile ? conceptFile !== null : typedConcepts.length > 0
  const toneReady = toneFromFile ? toneFile !== null : toneText.trim() !== ""
  const submitting = start.isPending
  const canRun = !!report && briefReady && conceptsReady && toneReady && !submitting

  function updateConcept(index: number, change: Partial<ConceptRow>) {
    setConcepts(concepts.map((c, i) => (i === index ? { ...c, ...change } : c)))
  }

  function run() {
    if (!report) return
    setSubmitError(null)
    start.mutate(
      {
        report,
        brief: briefFromFile ? "" : brief.trim(),
        briefFile: briefFromFile ? briefFile : null,
        concepts: conceptsFromFile ? [] : typedConcepts,
        conceptFile: conceptsFromFile ? conceptFile : null,
        toneText: toneFromFile ? "" : toneText.trim(),
        toneFile: toneFromFile ? toneFile : null,
      },
      {
        onSuccess: (data) => router.push(`/pm/annual-report-validator/runs/${data.job_id}`),
        onError: (err) => setSubmitError(startError(err)),
      },
    )
  }

  const textareaStyle: React.CSSProperties = { resize: "vertical", fontFamily: "inherit" }

  return (
    <div className="w-full space-y-6 p-6">
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: DARK }}>Annual Report Validator</h2>
        <p style={{ fontSize: 11, color: "#5A6080", marginTop: 2 }}>
          Validate an external annual report against its strategic brief, concept messages and
          tone. Long reports take a few minutes.
        </p>
      </div>

      <SetupCard
        expanded={setupExpanded}
        onToggleExpanded={() => setSetupExpanded((e) => !e)}
        caption="Report, brief, concept messages and tone - all in one place."
      >
        <Section step={1} title="Annual report" caption="DOCX only. Findings point to the report's own headings.">
          <FileDropzone file={report} accept={REPORT_ACCEPT} hint="to validate · DOCX" onPick={setReport} />
        </Section>

        <Section
          step={2}
          title="Strategic brief"
          caption="Type or paste it, or upload it as a file. Checks whether the report delivers what the brief asked for."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <ModeTabs fromFile={briefFromFile} onChange={setBriefFromFile} />
            {briefFromFile ? (
              <FileDropzone file={briefFile} accept={ACCEPT} hint="as PDF or DOCX" onPick={setBriefFile} />
            ) : (
              <textarea
                className="inp"
                rows={5}
                placeholder="Paste the strategic brief…"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                style={textareaStyle}
              />
            )}
          </div>
        </Section>

        <Section
          step={3}
          title="Concept messages"
          caption={`Type up to ${MAX_CONCEPTS} (the first is the primary message), or upload a file and the AI reads them out of it.`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <ModeTabs fromFile={conceptsFromFile} onChange={setConceptsFromFile} typeLabel="Type them" />
            {conceptsFromFile ? (
              <FileDropzone
                file={conceptFile}
                accept={ACCEPT}
                hint="to read concept messages from"
                onPick={setConceptFile}
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {concepts.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span style={{ marginTop: 10, width: 64, flexShrink: 0, fontSize: 11, color: MUTED }}>
                      {i === 0 ? "Primary" : "Secondary"}
                    </span>
                    <textarea
                      className="inp"
                      rows={2}
                      placeholder="The message, in a sentence or two"
                      value={c.message}
                      onChange={(e) => updateConcept(i, { message: e.target.value })}
                      style={{ ...textareaStyle, flex: 1 }}
                    />
                    {concepts.length > 1 && (
                      <button
                        type="button"
                        aria-label="Remove"
                        onClick={() => setConcepts(concepts.filter((_, j) => j !== i))}
                        style={{ marginTop: 6, background: "none", border: "none", color: MUTED, cursor: "pointer", padding: 4 }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {concepts.length < MAX_CONCEPTS && (
                  <button
                    type="button"
                    className="btn bs bsm"
                    onClick={() => setConcepts([...concepts, { message: "" }])}
                    style={{ width: "fit-content" }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add concept message
                  </button>
                )}
              </div>
            )}
          </div>
        </Section>

        <Section
          step={4}
          title="Tone"
          caption="Type or paste the company's house-style guide, or upload it as a file. The AI reads out the rules it states - voice, register, banned and preferred words, do's and don'ts."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <ModeTabs fromFile={toneFromFile} onChange={setToneFromFile} />
            {toneFromFile ? (
              <FileDropzone file={toneFile} accept={ACCEPT} hint="as PDF or DOCX" onPick={setToneFile} />
            ) : (
              <textarea
                className="inp"
                rows={6}
                placeholder="Paste the house-style guide…"
                value={toneText}
                onChange={(e) => setToneText(e.target.value)}
                style={textareaStyle}
              />
            )}
          </div>
        </Section>

        <Section step={5} title="Validate" last>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn bp"
              onClick={run}
              disabled={!canRun}
              style={{
                fontSize: 13,
                padding: "10px 20px",
                opacity: canRun ? 1 : 0.5,
                cursor: canRun ? "pointer" : "not-allowed",
              }}
            >
              {submitting ? "Uploading…" : "▶ Validate report"}
            </button>
            {submitError && <span style={{ fontSize: 11.5, color: "#DC2626" }}>{submitError}</span>}
            {!canRun && !submitting && !submitError && (
              <span style={{ fontSize: 11.5, color: MUTED }}>
                The report, brief, concept messages and a tone guide are all required.
              </span>
            )}
          </div>
        </Section>
      </SetupCard>

      <PreviousValidationsGallery />
    </div>
  )
}
