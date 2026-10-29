"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Lock,
  ScanSearch,
} from "lucide-react";

import {
  departmentsWithShortFacts,
  isAlreadyLocked,
  possessiveNames,
  useBuildReadiness,
  useDepartmentClaims,
  useCheckDrafts,
  useDraftFindings,
  useLockDraftFindings,
  FINDING_WRITE_KEY,
} from "@/hooks/useReportBuilder";
import { QUERY_KEYS } from "@/lib/constants";
import { usePMCycleDashboard } from "@/hooks/useSessions";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoader } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { DraftFindingsPanel } from "@/components/report/DraftFindingsPanel";
import { DraftCheckLoader } from "@/components/report/DraftCheckLoader";
import { WhatWasChecked } from "@/components/report/WhatWasChecked";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeletons";
import { formatDateTime } from "@/lib/utils";

/* What the analysis found, and the only route into the Report Builder.
   Putting Open Report Builder here rather than on the cycle page means the PM
   cannot reach the builder without passing the findings — which is the whole
   point of checking before the report is assembled. */
export default function CycleFindingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, isLoading } = useDraftFindings(id);
  const { data: readiness } = useBuildReadiness(id);
  const { data: dash } = usePMCycleDashboard(id);
  const check = useCheckDrafts(id);
  // Departments whose fact list looks short: the check trusts it, so their
  // "unsupported claim" findings may be wrong until the facts are re-read.
  const { data: claimsData } = useDepartmentClaims(id);
  const shortFacts = departmentsWithShortFacts(claimsData);

  // Resolves are optimistic and queued, and deliberately do not write the
  // server response back per call — a queued write returning mid-sequence
  // would overwrite findings the PM has clicked since. Reconcile once, when
  // the queue has drained.
  const qc = useQueryClient();
  const writing = useIsMutating({ mutationKey: FINDING_WRITE_KEY(id) });
  const prevWriting = useRef(0);
  useEffect(() => {
    if (prevWriting.current > 0 && writing === 0) {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.DRAFT_FINDINGS(id) });
    }
    prevWriting.current = writing;
  }, [writing, qc, id]);

  if (isLoading) return <PageLoader />;

  const findings = data?.findings ?? [];
  const openCount = data?.open_count ?? 0;
  // Counted from the findings themselves, so a click shows at once (resolves
  // are optimistic; open_count only catches up on the next load).
  const tally = { open: 0, corrected: 0, removed: 0, accepted: 0 };
  for (const f of findings) tally[f.status] += 1;
  const doneCount = findings.length - tally.open;
  // Analyze again replaces the open findings, so it waits until none are
  // left (a decision the PM was halfway through would be thrown away) and
  // until every click has been saved (a save landing after the new list
  // found its finding gone: "Finding with ID 'f7' not found").
  const saving = writing > 0;
  const mustHandleFirst = !!data?.checked_at && tally.open > 0;
  const neverChecked = !data?.checked_at;
  // Past the consent the page is a record, not a workspace.
  const locked = !!data?.locked_at;
  const cycleName = (dash as { cycle?: { cycle_name?: string } } | undefined)
    ?.cycle?.cycle_name;

  // A skeleton until the name arrives. "This cycle" is a real-looking sentence
  // built from a value we do not have yet, and it settles a beat later into
  // different words — which reads as the page correcting itself.
  const suffix = locked
    ? "locked, and kept as a record of what was changed"
    : neverChecked
      ? "the drafts haven't been analyzed yet"
      : openCount > 0
        ? `${openCount} thing${openCount === 1 ? "" : "s"} to check before building`
        : findings.length > 0
          ? "everything has been handled"
          : "no problems found";

  const description = cycleName ? (
    `${cycleName} — ${suffix}`
  ) : (
    <span className="flex items-center gap-2">
      <Skeleton className="h-3.5 w-28" />
      <span>— {suffix}</span>
    </span>
  );

  return (
    <div className="space-y-6">
      {check.isPending && <DraftCheckLoader />}

      <div className="flex items-start gap-3">
        <Link href={`/pm/cycles/${id}`}>
          <Button variant="outline" size="icon" className="mt-0.5 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          className="flex-1"
          title="Draft Findings"
          description={description}
          action={
            <>
              {!locked && (
                <Button
                  variant="outline"
                  onClick={() => check.mutate()}
                  disabled={check.isPending || saving || mustHandleFirst}
                  title={
                    mustHandleFirst
                      ? `Handle the ${tally.open} open finding${tally.open === 1 ? "" : "s"} before analyzing again.`
                      : undefined
                  }
                >
                  {check.isPending || saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : mustHandleFirst ? (
                    <Lock className="mr-2 h-4 w-4" />
                  ) : (
                    <ScanSearch className="mr-2 h-4 w-4" />
                  )}
                  {check.isPending
                    ? "Analyzing…"
                    : saving
                      ? "Saving your changes…"
                      : neverChecked
                        ? "Analyze"
                        : "Analyze again"}
                </Button>
              )}
              <OpenBuilderButton
                cycleId={id}
                canBuild={!!readiness?.can_build}
                // From the screen, not the server's open_count, which lags
                // until saves finish: locking while a click is still saving
                // made the server refuse that save.
                openCount={tally.open}
                saving={saving}
                locked={locked}
                findingCount={findings.length}
              />
            </>
          }
        />
      </div>

      {locked ? (
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
          <p className="text-xs text-slate-600">
            Locked on {formatDateTime(data!.locked_at!)}. These findings are a
            record — the report has been built from this text.
          </p>
        </div>
      ) : (
        data?.checked_at && (
          <p className="text-xs text-muted-foreground">
            Last analyzed {formatDateTime(data.checked_at)}.
          </p>
        )
      )}

      {!locked && shortFacts.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="min-w-0 flex-[999_1_320px] text-sm text-amber-900">
            <p className="font-bold">{possessiveNames(shortFacts)} facts look incomplete</p>
            <p className="mt-0.5">
              Figures in {shortFacts.length === 1 ? "its" : "their"} answers aren&apos;t in any
              fact, so some &ldquo;unsupported claim&rdquo; findings may be wrong. Read the facts
              again before working through them.
            </p>
          </div>
          <Link href={`/pm/cycles/${id}/claims`}>
            <Button variant="outline">
              Check Department Claims
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      )}

      {!locked && findings.length > 0 && tally.open > 0 && (
        <FindingsProgress
          done={doneCount}
          total={findings.length}
          tally={tally}
          saving={saving}
        />
      )}

      {findings.length === 0 ? (
        <div className="space-y-6 pb-10">
          {neverChecked ? (
            // Nothing has run, so this is a genuine empty state and keeps the
            // tall centred treatment.
            //
            // Locked as well as never checked is a real combination, not a
            // contradiction: cycles whose plan was already locked were
            // backfilled when this feature shipped, so the check never ran and
            // can no longer run. Inviting an Analyze the server will refuse is
            // worse than saying so.
            <EmptyState
              icon={ScanSearch}
              title={locked ? "Never analyzed, and now locked" : "Not analyzed yet"}
              description={
                locked
                  ? "The drafts were never checked before this report was built. They can no longer be analyzed, because the report has already been written from this text."
                  : "Analyze the drafts to look for claims the answers don't support, and figures that disagree between departments."
              }
            />
          ) : (
            <>
              {/* A result, not an empty state — so it reads as a green row
                  rather than a tall grey void, and hands straight over to the
                  evidence below it. */}
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-5 py-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-emerald-900">No problems found</p>
                  <p className="mt-0.5 text-sm text-emerald-800">
                    Every draft matches what its department stated, and no figures
                    disagree between departments.
                  </p>
                </div>
              </div>

              {/* "No problems found" is unverifiable on its own — this says
                  what was actually looked at. */}
              <WhatWasChecked cycleId={id} />
            </>
          )}
        </div>
      ) : !locked && tally.open === 0 ? (
        // Everything handled: lead with "ready to build" and fold the record
        // away - 72 struck-through cards read as work still to do.
        <AllHandled
          total={findings.length}
          tally={tally}
          saving={saving}
          list={<DraftFindingsPanel cycleId={id} findings={findings} scroll={false} />}
        />
      ) : (
        <DraftFindingsPanel cycleId={id} findings={findings} locked={locked} />
      )}
    </div>
  );
}

/* Every finding handled: a green "ready to build" summary, the counts, and
   the handled findings folded away (still there to look back at or undo). */
function AllHandled({
  total,
  tally,
  saving,
  list,
}: {
  total: number;
  tally: { corrected: number; removed: number; accepted: number };
  saving: boolean;
  list: React.ReactNode;
}) {
  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-5 py-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-emerald-900">
            All {total} finding{total === 1 ? "" : "s"} dealt with — ready to build
          </p>
          <p className="mt-0.5 text-sm text-emerald-800">
            {saving
              ? "Saving your changes…"
              : "Every flagged sentence was corrected, removed or confirmed. Open the Report Builder to continue, or analyze again to double-check your fixes."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Count n={tally.corrected} label="Corrected" className="text-blue-600" />
        <Count n={tally.removed} label="Removed" className="text-rose-600" />
        <Count n={tally.accepted} label="Looks right" className="text-emerald-600" />
      </div>

      <details open className="group rounded-2xl border border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-3.5 text-sm font-semibold text-[#1A1D2E]">
          <span className="flex items-center gap-2">
            <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-90" />
            Show the {total} handled finding{total === 1 ? "" : "s"}
          </span>
          <span className="text-xs font-medium text-slate-500">look back or undo</span>
        </summary>
        <div className="border-t border-slate-100 p-4">{list}</div>
      </details>
    </div>
  );
}

function Count({ n, label, className }: { n: number; label: string; className: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className={`text-2xl font-extrabold tabular-nums ${className}`}>{n}</p>
      <p className="text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}

/* How far the PM is through the findings, in the Validation page's blue box.
   Analyze again unlocks when every one is handled. */
function FindingsProgress({
  done,
  total,
  tally,
  saving,
}: {
  done: number;
  total: number;
  tally: { open: number; corrected: number; removed: number; accepted: number };
  saving: boolean;
}) {
  const parts = [
    `${tally.corrected} corrected`,
    `${tally.removed} removed`,
    `${tally.accepted} looks right`,
  ];
  if (tally.open > 0) parts.push(`${tally.open} still open`);
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4">
      <div className="min-w-0 flex-[999_1_320px]">
        <p className="text-sm font-bold text-blue-900">
          {tally.open === 0 ? "All findings dealt with" : "Work through the findings"}
          <span className="font-semibold tabular-nums text-blue-800">
            {" "}· {done} of {total} done
          </span>
        </p>
        <div className="mb-1.5 mt-2 h-1.5 max-w-[520px] overflow-hidden rounded-full bg-blue-100">
          <div
            className="h-full rounded-full bg-blue-600 transition-[width]"
            style={{ width: `${Math.round((done / total) * 100)}%` }}
          />
        </div>
        <p className="text-xs tabular-nums text-blue-800">{parts.join(" · ")}</p>
        <p className="mt-0.5 text-sm text-blue-800">
          {saving
            ? "Saving your changes…"
            : tally.open > 0
              ? `Edit, remove or mark each one "Looks right". Analyze again unlocks when all ${total} are done.`
              : "You can analyze again to confirm your fixes, or open the Report Builder."}
        </p>
      </div>
    </div>
  );
}

/* Three states, in order of the PM's journey.

   Blocked — findings still open, or the cycle is not assemblable. Nothing can
   deadlock here: "Looks right" clears a finding without touching any text, so
   even a finding the PM disagrees with costs one click rather than the report.

   Ready — the consent. Confirming is the point of no return, so it is spelled
   out rather than assumed.

   Locked — straight through, no second consent. */
function OpenBuilderButton({
  cycleId,
  canBuild,
  openCount,
  locked,
  findingCount,
  saving,
}: {
  cycleId: string;
  canBuild: boolean;
  openCount: number;
  locked: boolean;
  findingCount: number;
  /** A finding click is still being saved: opening would lock it out. */
  saving: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const lock = useLockDraftFindings(cycleId);

  if (locked) {
    return (
      <Link href={`/pm/cycles/${cycleId}/plan`}>
        <Button>
          Open Report Builder
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </Link>
    );
  }

  if (!canBuild || openCount > 0 || saving) {
    const reason = !canBuild
      ? "Available once sections are resolved and every department is approved"
      : saving
        ? "Saving your changes…"
        : `Handle all ${openCount} finding${openCount === 1 ? "" : "s"} first`;
    return (
      <Button disabled title={reason}>
        Open Report Builder
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    );
  }

  const handled =
    findingCount > 0
      ? `You've handled all ${findingCount} finding${findingCount === 1 ? "" : "s"}. Opening the builder locks them.`
      : "No problems were found in the drafts. Opening the builder locks this check.";

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        Open Report Builder
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => !lock.isPending && setOpen(next)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Open the Report Builder?
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-2 text-left">
              <span className="block">{handled}</span>
              <span className="block">
                You won&apos;t be able to analyze this cycle again.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={lock.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                lock.mutate(undefined, {
                  // Only on success: a failed lock must not land the PM in a
                  // builder he never actually consented to.
                  onSuccess: () => router.push(`/pm/cycles/${cycleId}/plan`),
                  // Except when it was already locked — the consent has
                  // happened, this page was just showing an older view of it.
                  onError: (err) => {
                    if (isAlreadyLocked(err)) {
                      router.push(`/pm/cycles/${cycleId}/plan`)
                    }
                  },
                })
              }
              disabled={lock.isPending}
            >
              {lock.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Open Report Builder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
