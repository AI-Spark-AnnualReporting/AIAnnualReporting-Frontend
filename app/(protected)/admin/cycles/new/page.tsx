"use client"

import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useCreateCycle } from "@/hooks/useCycles"
import { useUsers } from "@/hooks/useUsers"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArrowLeft, Info, UserCog, CalendarDays, FileText } from "lucide-react"
import Link from "next/link"

const schema = z.object({
  cycle_name: z.string().min(3, "Required — e.g. FY2025 Annual Report"),
  fiscal_year: z.number().min(2000).max(2100),
  start_date: z.string().min(1, "Required"),
  end_date: z.string().min(1, "Required"),
  submission_deadline: z.string().min(1, "Required"),
  project_manager_id: z.string().optional(),
  kickoff_brief: z.string().optional(),
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
    defaultValues: { fiscal_year: currentYear },
  })

  const selectedPM = watch("project_manager_id")
  const pmUser = usersData?.users.find((u) => u.user_id === selectedPM)

  const onSubmit = async (data: Form) => {
    const result = await createMutation.mutateAsync(data)
    // Backend may return { id } or { cycle_id } depending on the endpoint version
    const newId = result?.cycle_id || result?.id
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
            <Label>Project Manager</Label>
            <Controller
              name="project_manager_id"
              control={control}
              render={({ field }) => (
                <Select value={field.value || ""} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a Project Manager (optional)" />
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

        {/* Section 4: Optional Kickoff Brief */}
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">Kickoff Brief <span className="text-muted-foreground font-normal text-sm">(optional)</span></h2>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Provide strategic context for this reporting period — year highlights, priorities, and themes.
            The assigned PM can also write or refine this after the cycle is created.
          </p>
          <Textarea
            {...register("kickoff_brief")}
            placeholder="e.g. This year we focused on digital transformation, expanding to 3 new markets, and achieving carbon-neutral operations. Departments should highlight contributions to these pillars..."
            rows={5}
          />
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
