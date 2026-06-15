"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useCreateCycle } from "@/hooks/useCycles"
import { cyclesApi } from "@/lib/api/cycles"
import { useUsers } from "@/hooks/useUsers"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { COMPANY_PROFILES, SECTORS } from "@/lib/constants"
import { ArrowLeft, Info, UserCog, CalendarDays, FileText, Building2, Languages } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

const schema = z.object({
  cycle_name: z.string().min(3, "Required — e.g. FY2025 Annual Report"),
  fiscal_year: z.number().min(2000).max(2100),
  start_date: z.string().min(1, "Required"),
  end_date: z.string().min(1, "Required"),
  submission_deadline: z.string().min(1, "Required"),
  project_manager_id: z.string().min(1, "Project Manager is required"),
  kickoff_brief: z.string().optional(),
  company_profile: z.enum(["listed", "private"], {
    message: "Select a company profile",
  }),
  sector: z.enum(["bank", "insurance", "general", "reit", "finance_co"], {
    message: "Select a sector",
  }),
  is_shariah: z.boolean(),
  has_subsidiaries: z.boolean(),
  has_sukuk: z.boolean(),
})
type Form = z.infer<typeof schema>

export default function NewCyclePage() {
  const router = useRouter()
  const createMutation = useCreateCycle()
  const { data: usersData } = useUsers({ role: "project_manager", status: "active" })
  const currentYear = new Date().getFullYear()

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      fiscal_year: currentYear,
      is_shariah: false,
      has_subsidiaries: false,
      has_sukuk: false,
    },
  })

  const selectedPM = watch("project_manager_id")
  const pmUser = usersData?.users.find((u) => u.user_id === selectedPM)

  // Content language toggle — sent with the create-cycle payload (stored on the
  // cycle as `content_language`). It lives in local state rather than the form
  // schema since it's a simple two-way switch.
  const [contentLanguage, setContentLanguage] = useState<"english" | "arabic">("english")

  const onSubmit = async (data: Form) => {
    const result = await createMutation.mutateAsync({
      ...data,
      content_language: contentLanguage,
    })
    // Backend may return { id } or { cycle_id } depending on the endpoint version
    const newId = result?.cycle_id || result?.id
    try {
      await cyclesApi.resolveSections(newId)
    } catch {
      // View page will retry on mount if this silently fails
    }
    router.push(`/admin/cycles/${newId}`)
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/cycles">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          title="Create New Reporting Cycle"
          description="Define the cycle, assign a Project Manager, and set the timeline"
        />
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Info className="h-4 w-4 text-blue-600 shrink-0" />
          <p className="text-sm font-semibold text-blue-800">How the cycle workflow works</p>
        </div>
        <ol className="text-sm text-blue-700 space-y-1 ml-6 list-decimal">
          <li><strong>Admin creates the cycle</strong> — sets the name, fiscal year, dates, and assigns a Project Manager</li>
          <li><strong>PM configures the cycle</strong> — writes the kickoff brief, adds department timelines, activates it</li>
          <li><strong>Departments answer AI-generated questions</strong> — each department submits their narrative</li>
          <li><strong>PM reviews & generates the final report</strong></li>
        </ol>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

        {/* Section 1: Cycle Info */}
        <div className="rounded-xl border bg-card p-6 space-y-5">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">Cycle Information</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Cycle Name <span className="text-destructive">*</span></Label>
              <Input {...register("cycle_name")} placeholder="e.g. FY2025 Annual Report" />
              {errors.cycle_name && <p className="text-xs text-destructive">{errors.cycle_name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Fiscal Year <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                {...register("fiscal_year", { valueAsNumber: true })}
                placeholder={String(currentYear)}
              />
              {errors.fiscal_year && <p className="text-xs text-destructive">{errors.fiscal_year.message}</p>}
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Languages className="h-3.5 w-3.5 text-muted-foreground" />
                Content Language
              </Label>
              <div className="inline-flex rounded-lg border bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setContentLanguage("english")}
                  aria-pressed={contentLanguage === "english"}
                  className={cn(
                    "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                    contentLanguage === "english"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => setContentLanguage("arabic")}
                  aria-pressed={contentLanguage === "arabic"}
                  className={cn(
                    "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                    contentLanguage === "arabic"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  العربية
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Assign PM */}
        <div className="rounded-xl border bg-card p-6 space-y-5">
          <div className="flex items-center gap-2">
            <UserCog className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">Assign Project Manager</h2>
          </div>
          <p className="text-sm text-muted-foreground -mt-2">
            The PM will log in to write the kickoff brief, assign teams, and track department progress.
          </p>
          <div className="space-y-2">
            <Label>Project Manager <span className="text-destructive">*</span></Label>
            <Controller
              name="project_manager_id"
              control={control}
              render={({ field }) => (
                <Select value={field.value || ""} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a Project Manager" />
                  </SelectTrigger>
                  <SelectContent>
                    {usersData?.users.map((u) => (
                      <SelectItem key={u.user_id} value={u.user_id}>
                        {u.full_name} — {u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.project_manager_id && (
              <p className="text-xs text-destructive">{errors.project_manager_id.message}</p>
            )}
            {usersData?.users.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No active project managers found.{" "}
                <Link href="/admin/users" className="text-primary hover:underline">Create one first</Link>
              </p>
            )}
            {pmUser && (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                <UserCog className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-700 font-medium">{pmUser.full_name} will be notified and can configure this cycle</span>
              </div>
            )}
          </div>
        </div>

        {/* Section 3: Timeline */}
        <div className="rounded-xl border bg-card p-6 space-y-5">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">Timeline</h2>
          </div>
          <p className="text-sm text-muted-foreground -mt-2">
            Set the overall reporting period. The PM can further define per-department deadlines after activation.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Cycle Start Date <span className="text-destructive">*</span></Label>
              <Input type="date" {...register("start_date")} />
              {errors.start_date && <p className="text-xs text-destructive">{errors.start_date.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Cycle End Date <span className="text-destructive">*</span></Label>
              <Input type="date" {...register("end_date")} />
              {errors.end_date && <p className="text-xs text-destructive">{errors.end_date.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Submission Deadline <span className="text-destructive">*</span></Label>
              <Input type="date" {...register("submission_deadline")} />
              <p className="text-xs text-muted-foreground">When departments must submit by</p>
              {errors.submission_deadline && <p className="text-xs text-destructive">{errors.submission_deadline.message}</p>}
            </div>
          </div>
        </div>

        {/* Section 4: Company Profile */}
        <div className="rounded-xl border bg-card p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">Company Profile</h2>
          </div>
          <p className="text-sm text-muted-foreground -mt-2">
            These determine which sections your report requires.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Company Profile <span className="text-destructive">*</span></Label>
              <Controller
                name="company_profile"
                control={control}
                render={({ field }) => (
                  <Select value={field.value || ""} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a company profile" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(COMPANY_PROFILES).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.company_profile && (
                <p className="text-xs text-destructive">{errors.company_profile.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Sector <span className="text-destructive">*</span></Label>
              <Controller
                name="sector"
                control={control}
                render={({ field }) => (
                  <Select value={field.value || ""} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a sector" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SECTORS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.sector && (
                <p className="text-xs text-destructive">{errors.sector.message}</p>
              )}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Controller
              name="is_shariah"
              control={control}
              render={({ field }) => (
                <Checkbox
                  id="is_shariah"
                  checked={!!field.value}
                  onCheckedChange={field.onChange}
                  label="Shariah-compliant"
                />
              )}
            />
            <Controller
              name="has_subsidiaries"
              control={control}
              render={({ field }) => (
                <Checkbox
                  id="has_subsidiaries"
                  checked={!!field.value}
                  onCheckedChange={field.onChange}
                  label="Has subsidiaries"
                />
              )}
            />
            <Controller
              name="has_sukuk"
              control={control}
              render={({ field }) => (
                <Checkbox
                  id="has_sukuk"
                  checked={!!field.value}
                  onCheckedChange={field.onChange}
                  label="Has sukuk"
                />
              )}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link href="/admin/cycles">
            <Button variant="outline" type="button">Cancel</Button>
          </Link>
          <Button type="submit" disabled={createMutation.isPending} className="min-w-32">
            {createMutation.isPending ? "Creating..." : "Create Cycle"}
          </Button>
        </div>
      </form>
    </div>
  )
}
