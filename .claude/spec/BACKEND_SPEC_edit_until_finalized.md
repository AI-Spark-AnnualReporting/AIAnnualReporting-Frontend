# Backend Spec — Edit Until Finalized (Department Portal)

> **STATUS: SHIPPED (2026-07-16).** All three changes below are live and the
> frontend is wired to them. Verified against `http://localhost:8010/openapi.json`:
> `PUT .../draft` exists; `SessionDetail` carries `draft_content`,
> `answers_updated_at`, `outline_generated_at`, `draft_generated_at`;
> `OutlineResponse.editable` now reads *"True until the session is submitted"*.
> Kept as the contract of record.
>
> **One behaviour is documented nowhere and the frontend assumes it:**
> `POST /generate-outline` deletes the draft server-side. The frontend assumes
> this leaves `draft_content ?? final_submission ?? ai_generated_draft` resolving
> to empty for an in-progress session — i.e. it nulls `ai_generated_draft` too,
> not just `draft_content`. If only `draft_content` is nulled, the stale AI draft
> resurfaces and the UI will wrongly offer "View Draft". Worth asserting in a
> backend test.

## Overview

The department flow is a **one-way door**: generating the draft locks the outline, and draft edits are never persisted. It should not be. The real commitment is **submitting**, not generating.

Until a session is `submitted` / `approved`, the user must be able to move freely between **Answers ↔ Headings & Subheadings ↔ Draft** and edit all three.

The frontend half is done and shipped — navigation and the rebuild path work today. Three backend changes unlock the rest. Each is independent.

Verified against the local backend's `openapi.json` (`http://localhost:8010/openapi.json`) on 2026-07-16: none of the below exist yet.

---

## A. `editable` must track status, not step

**Today** (`OutlineResponse.editable`, per its own schema description):
> "True only while step is outline_generated (titles may be renamed)"

So generating the draft locks the outline forever. **Change it to:**

```python
editable = status in ("not_started", "in_progress", "reopened")
```

`PATCH /department/sessions/{id}/outline` must return `409 outline_locked` on **exactly** the same condition — no other. `assigned` / `hod_curation` stay `false` (questions aren't with the user yet); `submitted` / `approved` stay `false`.

The frontend already ANDs its own status check with this flag, so shipping this alone unlocks title editing with no frontend release.

---

## B. Save-draft endpoint + `draft_content` field

### B1. The endpoint

```
PUT /department/sessions/{session_id}/draft
Body:  { "content": string }        // "" is valid — the user cleared the draft
200:   { "success": true, "saved_at": "2026-07-16T10:32:11Z" }
409:   { "error": "session_locked", "message": "This session has been submitted." }
404:   { "error": "session_not_found" }
```

**PUT, not PATCH.** `PATCH .../outline` partially merges specific title ids. Save-draft is a full, idempotent replacement of one resource — a retried debounced auto-save must not compound.

`409 session_locked` deliberately mirrors `409 outline_locked` so the frontend reuses the same recover-and-relock branch. Lock condition is the same status set as (A).

Called on a ~800ms debounce while the user types, so it should be cheap — no LLM, no recomputation.

### B2. The field — a **new** `draft_content`, not a reuse of `ai_generated_draft`

| Field | Meaning | Written by |
|---|---|---|
| `ai_generated_draft` | Last **raw AI output**. Provenance only. | `generate-draft` |
| `draft_content` | **The working copy** — always exactly what the editor shows. | `generate-draft`, `PUT /draft` |
| `final_submission` | The submitted text. | `finalize` |

Write rules — **all three matter**:
- `POST /generate-draft` writes the new output to **both** `ai_generated_draft` **and** `draft_content`.
- `PUT /draft` writes `draft_content` **only**.
- `POST /finalize` writes `final_submission` and **nulls `draft_content`**.

Add `draft_content` to `SessionDetail`. The frontend resolves the editor's text as `draft_content ?? final_submission ?? ai_generated_draft ?? ""`:

| State | `draft_content` | `final_submission` | Resolves to |
|---|---|---|---|
| Draft generated | AI text | null | AI text ✅ |
| User edited | edited | null | edited ✅ |
| Regenerated | fresh AI | null | fresh AI ✅ |
| Finalized | null | submitted | submitted ✅ |
| **Reopened** | null | submitted | **submitted** ✅ |
| Reopened → edited | edited | submitted | edited ✅ |
| **Reopened → regenerated** | fresh AI | submitted | **fresh AI** ✅ |

That last row is *why* `generate-draft` must write `draft_content` too — otherwise a regenerate-while-reopened resolves to the stale `final_submission`.

**Why not just reuse `ai_generated_draft` as the working copy?** Three reasons; the third is decisive:
1. It destroys AI-vs-user provenance — you could never offer "reset to the AI version" (the outline already does this per-title).
2. Auto-save, tone-adjust, and regenerate all become last-writer-wins on one column: a debounced save landing 400ms after a regenerate silently reverts it.
3. **It cannot fix the reopen bug below** — with one field there is no precedence order that gets reopen-after-edit right.

### B3. This fixes a live data-loss bug

Today `final_submission` is only reachable when `ai_generated_draft` is null. So: user hand-edits the draft → finalizes (edits go to `final_submission`) → PM reopens → the draft page renders `ai_generated_draft`, **the original AI text. The user's edits are gone.**

The frontend has already switched to the precedence above, which fixes this for the common case. But until `draft_content` exists there's a narrower residual gap — regenerate-on-a-reopened-session — which the frontend currently papers over by trusting the `generate-draft` response directly. B2 removes the paper.

### B4. Optional, for later

A `version` int alongside `draft_content` + `409 draft_conflict` would make concurrent tabs safe (today the last `PUT` silently wins). Not needed now, but cheap to add the column while you're here.

---

## C. Staleness timestamps

Add:
- `outline.generated_at`
- `session.answers_updated_at`
- `session.draft_generated_at`

**Why:** non-linear navigation makes this the *common* path — answers → outline → draft → back → edit answers → the outline and draft are now silently built from superseded answers. The frontend **cannot detect this**: the outline blob carries only `version`, and `SessionDetail` has no `updated_at`.

With these, the outline page can say "Your answers changed after this outline was built — regenerate to pick them up", and the draft page the same for its outline. Without them, the UI can only show a permanent, non-specific disclaimer. Cheap now, expensive to retrofit.

---

## Definition of Done

- [ ] **A:** After `generate-draft`, `GET .../outline` still returns `editable: true` for an `in_progress` session; `PATCH .../outline` succeeds and the new title persists across a reload.
- [ ] **A:** For a `submitted` session, `editable` is `false` and `PATCH` returns `409 outline_locked`.
- [ ] **B:** `PUT .../draft` with `{"content": "hello"}` persists; a subsequent `GET .../sessions/{id}` returns `draft_content: "hello"`.
- [ ] **B:** `PUT .../draft` with `{"content": ""}` persists an empty string (not null, not a no-op).
- [ ] **B:** `PUT .../draft` on a `submitted` session returns `409 session_locked`.
- [ ] **B:** `POST .../generate-draft` writes the same text to both `ai_generated_draft` and `draft_content`.
- [ ] **B:** `POST .../finalize` sets `final_submission` and nulls `draft_content`.
- [ ] **B (regression):** Edit a draft by hand → finalize → PM reopens → `GET` resolves to the **edited** text, not the original AI text.
- [ ] **C:** `outline.generated_at`, `answers_updated_at`, and `draft_generated_at` are present and move when their subject changes.
