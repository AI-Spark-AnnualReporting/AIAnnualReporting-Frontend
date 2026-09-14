# Filter bar for the department question grid

Repo: `/Users/ahmer/Documents/Work/Anual Reporting/AIAnnualReporting-Frontend` (Next.js, :3000,
branch `staging`). Frontend only — no API change, no backend, no new data.

## Context

`/department/sessions/[id]` in **overview** mode renders every question as a card in one flat grid
(`app/(protected)/department/sessions/[id]/page.tsx:509-555`). Twenty cards today, and a department
can carry far more. There is no way to answer "what's left?" except to scroll and read status labels
one card at a time — which is the single most common thing someone on this screen wants to know.

Add a filter rail with live counts plus a search box. Status and search only, per the decision taken.

**Three states, not two.** The page already distinguishes Answered (emerald), **Not applicable**
(amber), and Not answered (slate) — `page.tsx:513-514, 522-541`. N/A is a real state with its own
business rule (`page.tsx:314-317`: at most half the questions may be N/A). The filter must carry all
three or it will misrepresent the work left.

**Intended outcome:** land on the page, see at a glance that 3 of 20 are unanswered, click once to
see only those, and type a few words to find a specific question.

## Design

The page already owns a strong segmented control: `components/ui/sort-control.tsx` — a
`rounded-full` rail on `bg-slate-50` with a gradient pill that *slides* to the active segment,
measured off the live DOM (`useLayoutEffect` + `ResizeObserver` on `offsetLeft`/`offsetWidth`, so
unequal label widths line up). It is used on three PM/HOD screens. The filter should read as its
sibling, not as a new idiom.

**The one deliberate move: the sliding pill takes the colour of the state it selects.**

```
   All 20        Answered 15      Not answered 3      N/A 2
 ╱indigo→violet╲   ╱emerald╲        ╱slate-600╲      ╱amber╲
```

Those are exactly the colours the status dots on the cards already use (`page.tsx:525-529`,
`:538-540`). So the rail is not decoration sitting above the grid — it is the same encoding as the
grid, and the pill sliding from emerald to amber tells you what changed before you read a word.
`All` keeps the indigo→violet brand gradient that `SortControl` uses, which is what makes the two
rails read as a family.

Everything else stays deliberately quiet: one plain search input, one line of result text, one
empty state. No second accent, no card animations, no icons that don't carry meaning.

```
┌──────────────────────────────────────────────────────────────────────┐
│  ←   Human Resources              15/20 answered ●  75%  [Download]  │   unchanged
├──────────────────────────────────────────────────────────────────────┤
│  ⟨ All 20 │ Answered 15 │ Not answered 3 │ N/A 2 ⟩    ⌕ Search…      │   new
└──────────────────────────────────────────────────────────────────────┘
     Showing 3 of 20  ·  Clear                                             new, only when filtering
┌─────────┐ ┌─────────┐ ┌─────────┐
│  card   │ │  card   │ │  card   │   unchanged
```

Counts sit *inside* each segment as a badge, reusing the exact badge markup from
`app/(protected)/pm/cycles/page.tsx:147-155`. They are computed on the **unfiltered** list, so the
numbers never move as you click — same convention as `countFor` at `pm/cycles/page.tsx:77-78`.

## The change

**New — `components/ui/segmented-filter.tsx`.** A sibling to `sort-control.tsx`, same directory,
same mechanics. Copy the rail's measuring logic, ARIA (`role="radiogroup"` / `role="radio"` /
`aria-checked`), and its `transition-[transform,width,opacity] duration-300 ease-out
motion-reduce:transition-none`. Differences: segments carry a `count`, and each option carries an
`accent` that colours the pill. Props:

```tsx
{ options: { value: string; label: string; count: number; accent?: string }[]
  value: string
  onChange: (value: string) => void }
```

It goes in `components/ui/` rather than inline because the page is already 1191 lines, and because
the focused-mode question sidebar (`page.tsx:726+`) is the obvious second caller later.

**Changed — `app/(protected)/department/sessions/[id]/page.tsx`**, overview block only
(`:472-558`). Two pieces of state (`statusFilter`, `query`), a derived visible list, the new rail +
search row between the header and the grid, and an empty state.

**The trap that will break this if it is missed.** The grid maps with an index:

```tsx
{questions.map((q: Question, idx: number) => {          // :511
   …
   onClick={() => { switchToQuestion(idx); … }}         // :518  ← navigates by index
   {answered ? <CheckCircle2/> : isNa ? <Ban/> : idx + 1}  // :534  ← displays the number
```

`idx` is both the card's displayed number and the argument that decides *which question opens*.
Filter the array naively and every card past the first gap opens the wrong question and shows the
wrong number. So pair each question with its original index **before** filtering and carry it
through:

```tsx
const visible = questions
  .map((q, idx) => ({ q, idx }))          // original index travels with the item
  .filter(({ q, idx }) => matches(q, idx))
```

then render `visible.map(({ q, idx }) => …)` with the body otherwise untouched.

**Filter predicate.** Status from the same expressions the cards already use — `naQuestions.has(id)`
and `answers[id]?.trim()` (`page.tsx:513-514`) — so the rail can never disagree with the card it
sits above. Search is case-insensitive across the full `q.question` (topic prefix included, since
`splitQuestion` keeps it in the string) and the answer text, so typing "demographics" or "18,600"
both work. No debounce — this is a client-side filter over one array that is already in memory.

**Header stats stay on the unfiltered list.** `answeredCount` and `progress` (`page.tsx:488-491`)
describe the session, not the current view. They must not move when the filter does — the
"Showing 3 of 20" line is what describes the view.

**Empty state.** Reuse `EmptyState` (`components/ui/empty-state.tsx`) with a "Clear filters" action,
in the app's voice: *"No questions match"* / *"Try a different status or search term."*

**RTL.** The grid already sets `dir={dirOf(q.question)}` per card for Arabic. The rail is
LTR chrome and stays as it is, but check the pill still lands correctly if the page direction is
inherited — `offsetLeft` is direction-aware, so verify rather than assume.

## Verification

From the frontend directory. The dev server is already on :3000, and it hot-reloads.

1. `npx tsc --noEmit` — baseline on `staging` is **0 errors**; expect 0 after.
2. `npm run lint` — confirm no new findings in the two touched files (there are 12 pre-existing
   errors elsewhere, e.g. `tailwind.config.ts`; compare, don't chase).
3. `npm run build`.

In the browser on `/department/sessions/session_228621b42f681ecc`, overview mode:

4. Counts on the rail add up to the total, and match the header's "X/20 answered".
5. **Click "Not answered", then open a card — it must open that exact question.** This is the
   index trap above; it is the one bug worth going looking for.
6. Card numbers keep their original position while filtered (a filtered card still shows `11`, not
   `1`).
7. Answer a question, return to overview: counts and rail update, and the card moves between
   segments.
8. Mark one N/A and confirm it lands in the N/A segment, not in Not answered.
9. Search "demographics" → 1 card; search a figure from an answer body → matches; clear → all 20.
10. Filter to something with no matches → empty state with a working Clear.
11. Header "15/20 answered · 75%" does **not** change while filtering.
12. Keyboard: tab to the rail, arrow/enter through segments, visible focus ring.
13. Narrow to ~400px — the rail wraps rather than overflowing, and the grid still collapses to one
    column.
