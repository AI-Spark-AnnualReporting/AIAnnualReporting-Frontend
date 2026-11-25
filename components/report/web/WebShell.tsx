"use client"

/**
 * The "Web" screen: the first step towards a microsite made from the report.
 *
 * Empty until the PM clicks "Create sitemap", which asks the AI to group the
 * report's sections into a menu. After that it shows the sitemap editor.
 * Nothing builds a website from the sitemap yet.
 *
 * The PM's edits live in `draft` here until they press Save; `saved` is what
 * the server has. Comparing the two is the "unsaved changes" check.
 */

import { ArrowLeft, Globe, Loader2, RefreshCw, Save } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { PageLoader } from "@/components/ui/spinner"
import { SitemapEditor } from "@/components/report/web/SitemapEditor"
import { useCreateSitemapDraft, useSaveSitemap, useWebSitemap } from "@/hooks/useWebSitemap"
import type { WebSitemap } from "@/lib/api/webSitemap"

/** The HTTP status of a failed request, if it had one. */
function errorStatus(error: unknown): number | undefined {
  const response = (error as { response?: { status?: number } } | null)?.response
  return response?.status
}

export function WebShell({ cycleId }: { cycleId: string }) {
  const router = useRouter()
  const query = useWebSitemap(cycleId)
  const createDraft = useCreateSitemapDraft(cycleId)
  const save = useSaveSitemap(cycleId)

  const saved = query.data?.sitemap ?? null
  const sections = query.data?.sections ?? []
  const [draft, setDraft] = useState<WebSitemap | null>(null)
  const [replaceOpen, setReplaceOpen] = useState(false)

  // Start editing from whatever the server now holds (first load, a new
  // draft, or a save).
  useEffect(() => {
    setDraft(saved)
  }, [saved])

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  // Closing or reloading the tab with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  function goBack() {
    if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) return
    router.push(`/pm/cycles/${cycleId}/report`)
  }

  function replaceSitemap() {
    setReplaceOpen(false)
    createDraft.mutate()
  }

  if (query.isLoading) return <PageLoader />

  const notAssembled = errorStatus(query.error) === 422

  return (
    <div className="-m-8 flex h-[calc(100vh-72px)] flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b bg-card px-5 py-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          aria-label="Go back"
          onClick={goBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">Web</h1>
          <p className="text-xs text-muted-foreground">
            The pages and menu of the report&apos;s microsite.
          </p>
        </div>
        {draft && (
          <>
            {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => setReplaceOpen(true)}
              disabled={createDraft.isPending || save.isPending}
            >
              {createDraft.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Create sitemap again
            </Button>
            <Button
              variant="brand"
              size="sm"
              className="h-8"
              onClick={() => save.mutate(draft)}
              disabled={!dirty || save.isPending}
            >
              {save.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              Save
            </Button>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 bg-slate-50">
        {notAssembled && (
          <EmptyMessage>
            This report has not been assembled yet. Assemble it on the report page first.
          </EmptyMessage>
        )}

        {!notAssembled && query.error && (
          <EmptyMessage>Could not load the sitemap. Please try again.</EmptyMessage>
        )}

        {!query.error && !draft && (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
            <Globe className="h-10 w-10 text-slate-300" />
            {createDraft.isPending ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Grouping your sections…
              </p>
            ) : (
              <>
                <p className="max-w-md text-sm text-muted-foreground">
                  Turn the report&apos;s sections into the pages and menu of a microsite. You
                  can change everything afterwards.
                </p>
                <Button variant="brand" onClick={() => createDraft.mutate()}>
                  Create sitemap
                </Button>
              </>
            )}
          </div>
        )}

        {!query.error && draft && (
          <SitemapEditor sitemap={draft} sections={sections} onChange={setDraft} />
        )}
      </div>

      <ConfirmDialog
        open={replaceOpen}
        onOpenChange={setReplaceOpen}
        title="Create the sitemap again?"
        description="The AI makes a new sitemap from the report's sections. This replaces your current sitemap and all its edits."
        confirmLabel="Replace sitemap"
        onConfirm={replaceSitemap}
      />
    </div>
  )
}

function EmptyMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <p className="max-w-md text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
