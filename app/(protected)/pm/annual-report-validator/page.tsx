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
import { useStartExternalValidation } from "@/hooks/useReportBuilder"
import type { ToneRules } from "@/lib/api/pm"

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
  title: string
  message: string
}

// The tone form keeps lists as typed text; they are split on send.
interface ToneForm {
  person: string
  register: string
  sentence_style: string
  tone_adjectives: string
  banned_words: string
  preferred_words: string
  do: string
  dont: string
}

const EMPTY_TONE: ToneForm = {
  person: "",
  register: "",
  sentence_style: "",
  tone_adjectives: "",
  banned_words: "",
  preferred_words: "",
  do: "",
  dont: "",
}

/** One item per line or comma, blanks dropped. */
function toList(text: string): string[] {
  const items: string[] = []
  for (const part of text.split(/[\n,]/)) {
    if (part.trim()) items.push(part.trim())
  }
  return items
}

/** The typed tone, in the shape the backend reads. */
function toToneRules(tone: ToneForm): ToneRules {
  return {
    person: tone.person.trim(),
    register: tone.register.trim(),
    sentence_style: tone.sentence_style.trim(),
    tone_adjectives: toList(tone.tone_adjectives),
    banned_words: toList(tone.banned_words),
    preferred_words: toList(tone.preferred_words),
    do: toList(tone.do),
    dont: toList(tone.dont),
  }
}

/** True when at least one tone rule is filled in. */
function hasToneRule(tone: ToneForm): boolean {
  return Object.values(tone).some((value) => value.trim() !== "")
}

function ValidatorForm() {
  const router = useRouter()
  const start = useStartExternalValidation()

  const [report, setReport] = useState<File | null>(null)
  const [brief, setBrief] = useState("")
  const [briefFile, setBriefFile] = useState<File | null>(null)
  const [conceptsFromFile, setConceptsFromFile] = useState(false)
  const [concepts, setConcepts] = useState<ConceptRow[]>([{ title: "", message: "" }])
  const [conceptFile, setConceptFile] = useState<File | null>(null)
  const [tone, setTone] = useState<ToneForm>(EMPTY_TONE)

  const typedConcepts = concepts.filter((c) => c.title.trim())
  const briefReady = brief.trim() !== "" || briefFile !== null
  const conceptsReady = conceptsFromFile ? conceptFile !== null : typedConcepts.length > 0
  const toneReady = hasToneRule(tone)
  const canRun = !!report && briefReady && conceptsReady && toneReady && !start.isPending

  function updateConcept(index: number, change: Partial<ConceptRow>) {
    setConcepts(concepts.map((c, i) => (i === index ? { ...c, ...change } : c)))
  }

  function updateTone(key: keyof ToneForm, value: string) {
    setTone({ ...tone, [key]: value })
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
        tone: toToneRules(tone),
      },
      {
        onSuccess: (data) => router.push(`/pm/annual-report-validator/runs/${data.job_id}`),
      },
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
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
                  <div className="flex-1 space-y-1.5">
                    <Input
                      placeholder="Title, e.g. Resilient Growth"
                      value={c.title}
                      onChange={(e) => updateConcept(i, { title: e.target.value })}
                    />
                    <Textarea
                      rows={2}
                      placeholder="The message, in a sentence or two"
                      value={c.message}
                      onChange={(e) => updateConcept(i, { message: e.target.value })}
                    />
                  </div>
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
                  onClick={() => setConcepts([...concepts, { title: "", message: "" }])}
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
        hint="The house style the report should follow. Fill in at least one. For lists, put one item per line or separate them with commas."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <ToneInput label="Voice" placeholder="e.g. we / the Company" value={tone.person} onChange={(v) => updateTone("person", v)} />
          <ToneInput label="Register" placeholder="e.g. formal" value={tone.register} onChange={(v) => updateTone("register", v)} />
          <ToneInput label="Sentence style" placeholder="e.g. short, active" value={tone.sentence_style} onChange={(v) => updateTone("sentence_style", v)} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ToneList label="Tone adjectives" value={tone.tone_adjectives} onChange={(v) => updateTone("tone_adjectives", v)} />
          <ToneList label="Banned words" value={tone.banned_words} onChange={(v) => updateTone("banned_words", v)} />
          <ToneList label="Preferred words" value={tone.preferred_words} onChange={(v) => updateTone("preferred_words", v)} />
          <ToneList label="Do's" value={tone.do} onChange={(v) => updateTone("do", v)} />
          <ToneList label="Don'ts" value={tone.dont} onChange={(v) => updateTone("dont", v)} />
        </div>
      </Field>

      <div className="flex items-center justify-end gap-3">
        {!canRun && !start.isPending && (
          <p className="text-xs text-slate-400">
            The report, brief, concept messages and at least one tone rule are all required.
          </p>
        )}
        <Button onClick={run} disabled={!canRun}>
          <ShieldCheck className="mr-2 h-4 w-4" />
          {start.isPending ? "Uploading…" : "Validate report"}
        </Button>
      </div>
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

function ToneInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-500">{label}</Label>
      <Input placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function ToneList({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-500">{label}</Label>
      <Textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
