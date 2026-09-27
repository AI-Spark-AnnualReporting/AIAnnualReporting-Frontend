"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Lock,
  ScanSearch,
} from "lucide-react";

import {
  useBuildReadiness,
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
                  disabled={check.isPending}
                >
                  {check.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ScanSearch className="mr-2 h-4 w-4" />
                  )}
                  {check.isPending
                    ? "Analyzing…"
                    : neverChecked
                      ? "Analyze"
                      : "Analyze again"}
                </Button>
              )}
              <OpenBuilderButton
                cycleId={id}
                canBuild={!!readiness?.can_build}
                openCount={openCount}
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

      {findings.length === 0 ? (
        <div className="space-y-6 pb-10">
          {neverChecked ? (
            // Nothing has run, so this is a genuine empty state and keeps the
            // tall centred treatment.
            <EmptyState
              icon={ScanSearch}
              title="Not analyzed yet"
              description="Analyze the drafts to look for claims the answers don't support, and figures that disagree between departments."
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
      ) : (
        <DraftFindingsPanel cycleId={id} findings={findings} locked={locked} />
      )}
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
}: {
  cycleId: string;
  canBuild: boolean;
  openCount: number;
  locked: boolean;
  findingCount: number;
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

  if (!canBuild || openCount > 0) {
    const reason = !canBuild
      ? "Available once sections are resolved and every department is approved"
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
