# Stage 3 — Frontend Spec: The Attach-Mode Panel (Upload · Verify · Lock)

**Goal of this stage:** Replace the `<AttachSection>` placeholder with a working panel: the PM uploads a source document, sees it attached, ticks "verified against source" to enable Lock, and locks it. Unlock and replace are available. The left-list status indicator and the "X of N locked" progress update live. **No AI.**

**Verifiable output:** Click an Upload-badge section → upload a PDF → file card appears → tick the verify checkbox → Lock enables → click Lock → left-list dot turns to a check, progress goes "1 of 45 locked." Unlock → back to pending, file still shown → replace → re-lock.

**Stack:** existing. Reuses the multipart pattern from `departmentApi.uploadDocument` (delete instance `Content-Type`, 120 s timeout, Axios sets boundary).

**Touches:**
- `lib/api/pm.ts` — `attachUpload`, `lockSection`, `unlockSection`, `removeAttachment`
- `types/index.ts` — `AttachmentInfo`, `SectionView`
- `hooks/useReportBuilder.ts` — four mutations + invalidation
- `components/report/AttachSection.tsx` — replace placeholder body with the real panel
- (left list + progress already read `usePMCycleSections` — they update on invalidation)

---

## 1. Types

```ts
export interface AttachmentInfo {
  document_id: string;
  filename: string;
  file_type: string;
  file_size: number;
  uploaded_at: string;
}

export interface SectionView {
  section_code: string;
  title: string;
  mode: SectionMode;
  status: SectionStatus;
  verified: boolean;
  locked_at: string | null;
  attachment: AttachmentInfo | null;
}
```

---

## 2. API layer (`lib/api/pm.ts`)

```ts
attachUpload: (cycleId: string, sectionCode: string, file: File) => {
  const fd = new FormData();
  fd.append("file", file);
  return apiClient.post<{ success: boolean; section: SectionView }>(
    `/pm/cycles/${cycleId}/sections/${sectionCode}/attachment`,
    fd,
    { headers: { "Content-Type": undefined }, timeout: 120_000 }   // multipart, long timeout (extract+chunk)
  ).then(r => r.data.section);
},

lockSection: (cycleId: string, sectionCode: string) =>
  apiClient.post(`/pm/cycles/${cycleId}/sections/${sectionCode}/lock`).then(r => r.data.section),

unlockSection: (cycleId: string, sectionCode: string) =>
  apiClient.post(`/pm/cycles/${cycleId}/sections/${sectionCode}/unlock`).then(r => r.data.section),

removeAttachment: (cycleId: string, sectionCode: string) =>
  apiClient.delete(`/pm/cycles/${cycleId}/sections/${sectionCode}/attachment`).then(r => r.data.section),
```

---

## 3. Hooks (`hooks/useReportBuilder.ts`)

Four mutations. **Every one invalidates `pmCycleSections(cycleId)`** so the left list + progress refresh, and `buildReadiness(cycleId)` if you show locked counts there.

```ts
export function useAttachUpload(cycleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionCode, file }: { sectionCode: string; file: File }) =>
      pmApi.attachUpload(cycleId, sectionCode, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_CYCLE_SECTIONS(cycleId) });
      toast.success("Document uploaded");
    },
    onError: (e: any) => toast.error(e?.message || "Upload failed"),
  });
}
// useLockSection, useUnlockSection, useRemoveAttachment — same shape,
// each invalidates PM_CYCLE_SECTIONS (and BUILD_READINESS) on success.
```

> Keep these as **single-section** mutations returning the updated `SectionView`. The detail panel can optimistically show the returned section while the list invalidation settles, so the right panel feels instant and the left list catches up a beat later.

---

## 4. The panel — `<AttachSection section={...}>`

Replaces the placeholder body. Renders one of two states based on `section.status`.

### Shared header (already exists from Stage 2)
Layer chip · mode badge (Upload) · content_source · section title. Keep it.

### State: `pending` (editable)

**If no attachment:**
- A **dropzone** (click or drag) accepting `.pdf .docx .doc .xlsx .txt` — this is regulatory/financial source material, so allow spreadsheets too. On select → `useAttachUpload`. Show a spinner / "Uploading…" during the 120 s-capped request (extraction runs server-side).
- Helper text: *"Upload the source document for this section. It will be embedded into the report exactly as provided."*

**If attachment present (uploaded, not yet locked):**
- A **file card**: filename, file type icon, `formatFileSize(file_size)`, uploaded timestamp (`formatDateTime`). A small "Replace" (re-opens dropzone → upload replaces) and "Remove" (`useRemoveAttachment`) control.
- The **verify gate** — a checkbox:
  `☐ I have verified this document against the official source.`
  Local state (`const [verified, setVerified] = useState(false)`), defaulting from `section.verified`.
- **Lock button** — `disabled={!attachment || !verified}`. Tooltip when disabled: *"Upload a document and confirm verification to lock."* On click → `useLockSection`.

> **The verify checkbox is the human compliance gate.** The backend lock endpoint doesn't re-check a boolean payload — calling lock *is* the assertion. So the checkbox's only job is to gate the button client-side; the meaningful record is that the PM clicked Lock. Don't overthink it — checkbox enables button, button calls lock. (If you later want the assertion persisted as an explicit audit event, that's a backend addition, not this.)

### State: `locked` (read-only + unlock)
- File card (filename, size, uploaded time) — **no replace/remove controls** (backend returns 409; don't offer it).
- A green **"Locked"** state line with `locked_at` (`formatDateTime`).
- An **Unlock** button (secondary/ghost). On click → confirm via `<ConfirmDialog>` (*"Unlock this section? You'll need to verify it again before re-locking."*) → `useUnlockSection`. After unlock the panel returns to the `pending` state with the file still attached and the checkbox unticked.

---

## 5. Left list + progress (already wired, just confirm)

`SectionList` and the progress bar read `usePMCycleSections`. Because the mutations invalidate that key, after a lock:
- the section's **status dot** flips hollow-circle → **check**;
- **"X of N sections locked"** increments;
- the progress bar advances.

No new code if Stage 2 rendered status from the live `status` field. If Stage 2 hardcoded "pending," fix it to read `section.status` now.

---

## 6. Verification (how you test this stage)

On the resolved cycle, pick **Financial Statements** (Upload badge):

1. Panel shows a **dropzone**. Upload a PDF → file card appears with name/size/time; checkbox present and **unticked**; **Lock disabled**.
2. Tick **verify** → Lock **enables**. Untick → Lock disables again.
3. Click **Lock** → panel switches to locked state (green, `locked_at`); left-list dot becomes a **check**; progress reads **"1 of 45 locked."**
4. In locked state, confirm there's **no Replace/Remove** — only **Unlock**.
5. **Unlock** (confirm dialog) → panel returns to pending, **file still shown**, checkbox unticked, Lock disabled again; progress back to **"0 of 45."**
6. **Replace** the file → old card replaced by new file's card, still unverified.
7. Re-verify + **Lock** → locked again.
8. **Remove** (while pending, no lock) → back to empty dropzone.
9. Click a **generate** section (Chairman's) → still the AI placeholder (untouched). Click **Cover** → System placeholder. (Other modes unaffected.)
10. Upload a clearly large/slow file → the 120 s timeout + spinner behave (no premature failure).

---

## 7. Out of scope for Stage 3

- **No preview of the uploaded file** in-panel (just the metadata card). A PDF viewer is a nice-to-have, not now — though showing the filename + a download link is fine if cheap.
- **No generate-mode behavior** — placeholders remain until Stage 7.
- **No verbatim embedding into the final report** — that's Stage 8 render. This stage only attaches + locks.
- **No version history** — replace deletes the old file (backend §4.1 decision).

---

*End of Stage 3 frontend spec. Once §6 passes, the entire attach-mode half of a report is completable on screen — for a listed company that's the majority of sections done with zero AI. The next slice, Stage 4, starts the generate side: assembling the corpus and producing per-department digests (the map step) — backend-only, inspectable text output, no UI.*