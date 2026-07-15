# Frontend Spec — Outline Before Draft (Department Portal)

## Overview

Add an **Outline** step to the department session flow, between "Answer Questions" and "Generate Draft".

The user sees AI-generated headings and subheadings built from their answers. They can **rename** them. They **cannot** add, delete, or reorder them. Once they continue, the draft is generated under that outline and the outline becomes read-only.

Stepper becomes:

```
Questions → Documents → Answers → Outline → Draft → Finalize
```

---

## Depends On

- Backend spec `BACKEND_SPEC_outline_before_draft.md` merged.
- Existing department session page and step components. **Mirror the existing draft step's file layout, routing, and styling. Do not introduce a new pattern.**

---

## API Contract

| Call | Purpose |
|---|---|
| `GET /sessions/{id}/outline` | `{ "outline": {...} \| null, "editable": bool }` |
| `POST /sessions/{id}/generate-outline` | `{ "outline": {...}, "step": "outline_generated" }` |
| `PATCH /sessions/{id}/outline` | body `{ "titles": [{ "id": "h1", "title": "..." }] }` → full outline |
| `POST /sessions/{id}/generate-draft` | unchanged call, now requires an outline |

Outline shape:

```json
{
  "version": 1,
  "headings": [
    { "id": "h1", "order": 1, "title": "Operational Performance", "ai_title": "Operational Performance",
      "subheadings": [
        { "id": "h1_s1", "order": 1, "title": "Production Volumes", "ai_title": "Production Volumes",
          "question_ids": ["q3", "q7"] }
      ]
    }
  ]
}
```

Error responses to handle: `409 outline_locked`, `409 outline_required`, `400 no_answers`, `400 unknown_id`, `400 invalid_title`.

---

## Files to Change

| File | Change |
|---|---|
| Department session page (the component rendering the step flow) | Add the `outline_generated` step to the stepper and route to `OutlineStep`. |
| Department API client | Add `getOutline`, `generateOutline`, `patchOutlineTitles`. |
| Step/status label maps | Add `outline_generated` → "Outline". |
| Draft step component | Show the read-only outline above the draft editor (headings + subheadings, no controls). |

## Files to Create

| File | Contents |
|---|---|
| `OutlineStep.tsx` | The screen. Fetch, generate, render, continue. |
| `OutlineHeadingCard.tsx` | One heading + its subheadings, with inline title editing. |

Place both next to the existing step components.

---

## Screen Behaviour

### Empty state (no outline yet)

- Short explainer: the outline is built from your answers; you can rename headings but not add or remove them.
- Primary button **Generate Outline**.
- Disabled with a tooltip if no questions are answered. On `400 no_answers`, toast: "Answer at least one question first."
- While loading: skeleton cards + "Building your outline from your answers…". This is an LLM call — assume up to 30s.

### Outline state (`editable = true`)

- Ordered list of heading cards. Each card:
  - Heading title — inline editable, styled as an H2.
  - Its subheadings — inline editable, styled as H3, indented.
  - Per subheading: a muted chip showing the mapped answer count, e.g. `2 answers`. Tooltip on hover lists the question texts.
- Footer bar: **Regenerate Outline** (secondary) and **Continue → Generate Draft** (primary).
- **Regenerate** opens a confirm dialog: "This rebuilds the outline from scratch. Any titles you changed will be lost." Confirm → `POST /generate-outline`.

### Read-only state (`editable = false`, i.e. step is `draft_generated` or later)

- Same list, no inputs, no buttons, a lock icon and one line: "The outline is locked once the draft is generated."

---

## Editing Rules (enforce all of these in the UI)

1. **No add.** No "Add heading" / "Add subheading" button anywhere.
2. **No remove.** No delete icon, no swipe action, no context menu.
3. **No reorder.** No drag handles, no up/down arrows. Render strictly by `order`.
4. Titles are `<input>` elements bound to `title` only.
5. `maxLength={120}`. Show a counter when the value exceeds 100 chars.
6. On blur:
   - Trim the value.
   - If unchanged → no call.
   - If trimmed length < 3 → revert to the last saved value and toast "Title must be at least 3 characters."
   - Else `PATCH` **only that one id** and show a small inline "Saved" tick for ~1.5s.
7. `Enter` blurs the field (commits). `Escape` reverts to the last saved value.
8. Each title with `title !== ai_title` shows a small "reset" icon that sets the value back to `ai_title` and PATCHes it.
9. On `409 outline_locked`: refetch the outline, switch to read-only, toast "This outline is locked."
10. Failed PATCH: revert the field to the last saved value, toast the error. **Never leave the UI showing a title that isn't in the DB.**

---

## Continue → Generate Draft

- Blur any focused field first, so an in-flight rename commits before generating.
- Disable the button while any PATCH is in flight.
- Call the existing `POST /sessions/{id}/generate-draft`, then advance to the draft step exactly as today.
- On `409 outline_required`: refetch and show the empty state.

---

## Definition of Done

- [ ] Stepper shows Outline between Answers and Draft; navigating a session at `outline_generated` lands there.
- [ ] Generate Outline on a session with answers renders headings with subheadings and answer-count chips.
- [ ] Renaming a heading, blurring, and reloading the page shows the new title.
- [ ] Escape reverts an edit and fires no request; Enter commits.
- [ ] A title of 2 characters is rejected client-side and the field reverts.
- [ ] Reset icon appears only on edited titles and restores `ai_title`.
- [ ] Regenerate shows the warning dialog and replaces the outline; edited titles are gone.
- [ ] There is no control anywhere on the screen that adds, deletes, or reorders a heading or subheading.
- [ ] After Continue, the draft renders under the outline and the outline is read-only with a lock icon.
- [ ] Arabic session: titles render RTL and inputs behave correctly.
- [ ] Slow / failed outline generation shows a loading state then an error with a retry, never a blank screen.
