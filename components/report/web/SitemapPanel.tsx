"use client"

/**
 * The side panel that opens when a box in the sitemap tree is clicked.
 * One block per box type: Home, group, page. Every change goes through a
 * helper in lib/webSitemapEdits.ts.
 */

import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, FileText, Globe, Layers, Plus, Scissors, Trash2, X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { WebSitemap, WebSitemapGroup, WebSitemapPage } from "@/lib/api/webSitemap"
import { cn } from "@/lib/utils"
import {
  allPages, deleteGroup, deletePage, mergePage, moveGroup, movePage, movePageToGroup,
  removeSectionFromPage, renameGroup, renameHome, renamePage, splitSection, toggleHidden,
} from "@/lib/webSitemapEdits"

import type { Selection } from "./SitemapTree"

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"

interface SitemapPanelProps {
  sitemap: WebSitemap
  selection: Selection
  titles: Map<string, string>
  onChange: (next: WebSitemap) => void
  onSelect: (selection: Selection) => void
  onAddPage: (groupId: string) => void
}

export function SitemapPanel({
  sitemap, selection, titles, onChange, onSelect, onAddPage,
}: SitemapPanelProps) {
  if (!selection) return null
  const close = () => onSelect(null)

  if (selection.kind === "home") {
    return (
      <PanelFrame icon={<Globe className="h-4 w-4" />} kind="Home page" onClose={close}>
        <Field label="Title">
          <Input
            autoFocus
            dir="auto"
            value={sitemap.home.title}
            onChange={(event) => onChange(renameHome(sitemap, event.target.value))}
          />
        </Field>
        <p className="text-xs text-muted-foreground">
          The landing page of the site. Every group in the menu hangs off it.
        </p>
      </PanelFrame>
    )
  }

  if (selection.kind === "group") {
    const index = sitemap.groups.findIndex((g) => g.id === selection.id)
    if (index === -1) return null
    return (
      <GroupPanel
        sitemap={sitemap}
        group={sitemap.groups[index]}
        index={index}
        onChange={onChange}
        onClose={close}
        onAddPage={onAddPage}
      />
    )
  }

  for (const group of sitemap.groups) {
    const index = group.pages.findIndex((p) => p.id === selection.id)
    if (index !== -1) {
      return (
        <PagePanel
          sitemap={sitemap}
          group={group}
          page={group.pages[index]}
          index={index}
          titles={titles}
          onChange={onChange}
          onSelect={onSelect}
          onClose={close}
        />
      )
    }
  }
  return null
}

interface GroupPanelProps {
  sitemap: WebSitemap
  group: WebSitemapGroup
  index: number
  onChange: (next: WebSitemap) => void
  onClose: () => void
  onAddPage: (groupId: string) => void
}

function GroupPanel({ sitemap, group, index, onChange, onClose, onAddPage }: GroupPanelProps) {
  const isEmpty = group.pages.length === 0
  return (
    <PanelFrame icon={<Layers className="h-4 w-4" />} kind="Menu group" onClose={onClose}>
      <Field label="Name in the menu">
        <Input
          autoFocus
          dir="auto"
          value={group.title}
          onChange={(event) => onChange(renameGroup(sitemap, group.id, event.target.value))}
        />
      </Field>

      <Field label="Position in the menu">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={index === 0}
            onClick={() => onChange(moveGroup(sitemap, group.id, -1))}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Left
          </Button>
          <Button variant="outline" size="sm" disabled={index === sitemap.groups.length - 1}
            onClick={() => onChange(moveGroup(sitemap, group.id, 1))}>
            Right <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </Field>

      <Field label={`Pages (${group.pages.length})`}>
        <Button variant="outline" size="sm" onClick={() => onAddPage(group.id)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add page to this group
        </Button>
      </Field>

      <DangerZone>
        <Button variant="outline" size="sm" disabled={!isEmpty}
          className="text-red-600 hover:text-red-700"
          onClick={() => { onChange(deleteGroup(sitemap, group.id)); onClose() }}>
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete group
        </Button>
        {!isEmpty && (
          <p className="text-xs text-muted-foreground">
            Move or merge its pages first. Only an empty group can be deleted.
          </p>
        )}
      </DangerZone>
    </PanelFrame>
  )
}

interface PagePanelProps {
  sitemap: WebSitemap
  group: WebSitemapGroup
  page: WebSitemapPage
  index: number
  titles: Map<string, string>
  onChange: (next: WebSitemap) => void
  onSelect: (selection: Selection) => void
  onClose: () => void
}

function PagePanel({
  sitemap, group, page, index, titles, onChange, onSelect, onClose,
}: PagePanelProps) {
  const otherPages = allPages(sitemap).filter((entry) => entry.page.id !== page.id)
  const isMerged = page.section_codes.length > 1

  function mergeInto(targetId: string) {
    onChange(mergePage(sitemap, page.id, targetId))
    onSelect({ kind: "page", id: targetId })
  }

  return (
    <PanelFrame icon={<FileText className="h-4 w-4" />} kind="Page" onClose={onClose}>
      <Field label="Title">
        <Input
          autoFocus
          dir="auto"
          value={page.title}
          onChange={(event) => onChange(renamePage(sitemap, page.id, event.target.value))}
        />
      </Field>

      <button
        type="button"
        role="switch"
        aria-checked={!page.hidden}
        onClick={() => onChange(toggleHidden(sitemap, page.id))}
        className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-left"
      >
        <span>
          <span className="block text-sm font-medium">Visible on site</span>
          <span className="block text-xs text-muted-foreground">
            {page.hidden ? "Hidden: kept here, but left off the site." : "Shown in the menu."}
          </span>
        </span>
        <span className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition",
          page.hidden ? "bg-slate-300" : "bg-brand",
        )}>
          <span className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
            page.hidden ? "left-0.5" : "left-[18px]",
          )} />
        </span>
      </button>

      <Field label="Report sections on this page">
        {page.section_codes.length === 0 ? (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
            None yet. This is an extra page. Drag a section onto it, or merge a page into it.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {page.section_codes.map((code) => (
              <li key={code} className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs">
                {titles.has(code) ? (
                  <>
                    <span dir="auto" className="flex-1 text-slate-700">{titles.get(code)}</span>
                    {isMerged && (
                      <button type="button"
                        className="flex items-center gap-1 font-medium text-indigo-600 hover:underline"
                        onClick={() => onChange(splitSection(sitemap, page.id, code, titles.get(code) ?? code))}>
                        <Scissors className="h-3 w-3" /> Split out
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-slate-400">{code}</span>
                    <span className="rounded bg-amber-100 px-1.5 text-amber-800">removed from report</span>
                    <button type="button" className="font-medium text-indigo-600 hover:underline"
                      onClick={() => onChange(removeSectionFromPage(sitemap, page.id, code))}>
                      Remove
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Field>

      <Field label="Position">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={index === 0}
            onClick={() => onChange(movePage(sitemap, page.id, -1))}>
            <ArrowUp className="mr-1 h-3.5 w-3.5" /> Up
          </Button>
          <Button variant="outline" size="sm" disabled={index === group.pages.length - 1}
            onClick={() => onChange(movePage(sitemap, page.id, 1))}>
            <ArrowDown className="mr-1 h-3.5 w-3.5" /> Down
          </Button>
        </div>
      </Field>

      <Field label="Group">
        <select
          value={group.id}
          onChange={(event) => onChange(movePageToGroup(sitemap, page.id, event.target.value))}
          className={SELECT_CLASS}
        >
          {sitemap.groups.map((g) => (
            <option key={g.id} value={g.id}>{g.title || "Untitled group"}</option>
          ))}
        </select>
      </Field>

      {page.section_codes.length > 0 && otherPages.length > 0 && (
        <Field label="Merge into another page">
          <select value="" onChange={(event) => mergeInto(event.target.value)} className={SELECT_CLASS}>
            <option value="" disabled>Choose a page…</option>
            {otherPages.map(({ page: other, groupTitle }) => (
              <option key={other.id} value={other.id}>
                {groupTitle} › {other.title || "Untitled page"}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Tip: you can also drag this box onto another page.
          </p>
        </Field>
      )}

      {page.section_codes.length === 0 && (
        <DangerZone>
          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700"
            onClick={() => { onChange(deletePage(sitemap, page.id)); onClose() }}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete page
          </Button>
        </DangerZone>
      )}
    </PanelFrame>
  )
}

interface PanelFrameProps {
  icon: React.ReactNode
  kind: string
  onClose: () => void
  children: React.ReactNode
}

function PanelFrame({ icon, kind, onClose, children }: PanelFrameProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand/10 text-brand">
          {icon}
        </span>
        <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{kind}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Close panel" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
    </div>
  )
}

function DangerZone({ children }: { children: React.ReactNode }) {
  return <div className="mt-auto flex flex-col gap-1.5 border-t pt-4">{children}</div>
}
