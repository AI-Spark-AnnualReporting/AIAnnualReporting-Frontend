# Stage 7b — Frontend Spec: The Chat Refinement Panel

**Goal of this stage:** Add a chat box beside (or below) the `<ProsePreview>` on generate-mode sections. The PM types an instruction ("make it more concise," "add the cost-reduction figure"), it calls refine, and the whole preview updates with the revised section. Completes the section workspace: generate → refine by chat → lock. Builds on the 7a panel — same preview, plus a chat input and a session-only turn list.

**Verifiable output:** On a drafting section, type "make this more concise" → preview updates with shorter prose → type "make the tone more formal" → preview updates again. Lock still works. Refresh → content persists (the latest refined version), chat history clears (session-only).

**Stack:** existing. Reuses `<ProsePreview>` from 7a, the 7b refine endpoint.

**Touches:**
- `lib/api/pm.ts` — `refineSection(cycleId, sectionCode, instruction)`
- `hooks/useReportBuilder.ts` — `useRefineSection(cycleId)`
- `components/report/GenerateSection.tsx` — add the chat panel to the `drafting` state
- `components/report/SectionChat.tsx` — NEW: the chat input + session turn list

---

## 1. API + hook

```ts
// pm.ts
refineSection: (cycleId: string, sectionCode: string, instruction: string) =>
  apiClient.post(
    `/pm/cycles/${cycleId}/sections/${sectionCode}/refine`,
    { instruction },
    { timeout: 120_000 },
  ).then(r => r.data.section),   // SectionView with revised content, status: drafting
```

```ts
// useReportBuilder.ts
export function useRefineSection(cycleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionCode, instruction }: { sectionCode: string; instruction: string }) =>
      pmApi.refineSection(cycleId, sectionCode, instruction),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_CYCLE_SECTIONS(cycleId) }),
    onError: (e: any) => toast.error(e?.message || "Refinement failed"),
  });
}
```

---

## 2. Where the chat lives — `drafting` state only

The chat panel appears **only in the `drafting` state** of `<GenerateSection>` (alongside the existing preview + Regenerate + Lock). Not in `pending` (nothing to refine yet), not in `locked` (must unlock first — backend 409s).

Layout for the drafting state:
```
┌─────────────────────────────────────────────┐
│  <ProsePreview content={section.content} />   │   ← updates each turn
│  ───────────────────────────────────────────│
│  [ chat turn list (session-only) ]            │
│  ┌─────────────────────────────────────────┐ │
│  │ "make this more concise…"        [Send] │ │   ← <SectionChat>
│  └─────────────────────────────────────────┘ │
│  Regenerate · Lock                            │
└─────────────────────────────────────────────┘
```
Two reasonable arrangements — chat **below** the preview (simplest, matches the prototype's stacked layout) or **beside** it (preview left, chat right). Below is fine for v1; the prototype showed a bottom chat bar. Either works since `<ProsePreview>` is self-contained.

---

## 3. `<SectionChat>` — the input + session history

```tsx
function SectionChat({ cycleId, sectionCode }) {
  const [instruction, setInstruction] = useState("");
  const [turns, setTurns] = useState<{ instruction: string }[]>([]);  // session-only, display
  const refine = useRefineSection(cycleId);

  const send = () => {
    const text = instruction.trim();
    if (!text || refine.isPending) return;
    setTurns(t => [...t, { instruction: text }]);   // show what was asked
    setInstruction("");
    refine.mutate({ sectionCode, instruction: text });
    // onSuccess invalidates PM_CYCLE_SECTIONS → preview re-renders with new content
  };
  // Enter sends; Shift+Enter newline; input + Send disabled while refine.isPending
}
```

Behaviour:
- **Session-only history.** The turn list (what the PM asked) lives in **component state**, display only. The backend is stateless (no transcript) — so on reload, the chat list is empty but the *content* reflects all prior refinements (it's the saved state). This matches the backend design; don't try to persist chat.
- **The preview is the answer, not a chat bubble.** Each turn's "response" is the updated `<ProsePreview>` above — the model returns the whole revised section, the preview swaps wholesale (full-replace). Don't render the revised prose as a chat message; the preview *is* the output. The turn list just shows the *instructions* given, so the PM remembers what they've asked.
- **In-flight state:** while `refine.isPending`, show a subtle "Refining…" indicator on the preview (e.g. dim + spinner) and disable the input + Send. One refine at a time.
- **Empty instruction:** Send disabled when the box is empty/whitespace (mirrors backend 422; don't fire it).
- **Suggested chips (optional, nice):** a few one-tap instructions — "Make it concise," "More formal," "Expand detail" — that fill the input. Cheap UX win; skip if time-pressed.

---

## 4. Interaction with existing 7a controls

- **Regenerate** still present — but note it *discards all refinements* (fresh generation overwrites everything). Keep the existing confirm; its wording already covers "replace this draft."
- **Lock** unchanged — locks the current (refined) content. After lock, the chat panel disappears (locked state has no chat). Unlock → drafting → chat returns.
- The **left-list status** stays `drafting` through refinement (refine doesn't change status), so no left-list change per turn — only the preview updates. The dot changes only on lock. (Correct — refining isn't a status change.)

---

## 5. Verification (how you test this stage — fold into your final testing)

On a generated, drafting section (Strategy/IT):

1. **Concise:** type "make this more concise" → Send → preview updates to shorter prose; the instruction shows in the turn list.
2. **Retone:** "make the tone more formal" → preview updates again; both instructions now in the turn list.
3. **In-flight lock:** while a refine is running, input + Send are disabled, preview shows a refining indicator; no double-send.
4. **Sequential evolution:** 3–4 instructions in a row → preview evolves sensibly each time, operating on the latest version.
5. **Lock after refine:** Lock → locked banner, chat panel gone, content = last refined version. Unlock → chat returns.
6. **Reload:** refine twice, then refresh → preview shows the latest refined content (persisted), chat turn list is empty (session-only, as designed).
7. **Empty instruction:** Send disabled on empty box.
8. **Regenerate discards:** after refining, Regenerate → fresh generation replaces all refinements (confirm dialog warns).

**Critical content checks (the backend's cardinal tests — do these here, by reading the prose):**
9. **Won't invent on request:** type "add that revenue grew 50%" (a figure NOT in IT's source) → read the result → the 50% must NOT appear. The model should do the rest / ignore the unsupported fact, never fabricate. **This is the most important check in the stage.**
10. **No drift over turns:** after 4 refinements, read the final content against IT's source — facts still accurate, nothing distorted or invented crept in.

---

## 6. Out of scope for 7b

- **No persisted chat history** — session-only display; backend is stateless. (A saved transcript is a deliberate later feature.)
- **No manual free-text editing of the prose** — refinement is instruction-driven only. (If you want a "let me edit it myself" textarea too, that's a separate small feature — flag it; not here.)
- **No multi-section / global chat** — one section at a time.
- **No weave / final document** — Stage 8.

