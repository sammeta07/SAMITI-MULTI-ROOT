# Search Pill Pattern — Reusable Prompt

Use this prompt to add a new search input anywhere in the Samiti app. It reproduces the
design, hover effects, and X-icon clear functionality of the Home component search pill.

Reference implementation (canonical source of truth):
- Template structure — `samiti/src/app/features/home/home.component.html` (lines 24-41)
- Visual design — `samiti/src/app/features/home/home.component.scss` (lines 160-250)
- TS signal + clear handler — `samiti/src/app/features/home/home.component.ts` (lines 83-90)

---

## Prompt

> Add a search input to this Angular component, styled like the Home component search pill
> (`home.component.html` / `home.component.scss`). Requirements:
>
> 1. **HTML** — render a pill with this exact child order:
>    `<mat-icon class="ssp-icon">search</mat-icon>` → `<input class="ssp-input">` →
>    `<button class="clear-search-trigger"><mat-icon>close</mat-icon></button>`.
>    Bind the input to a signal with `[ngModel]="query()" (ngModelChange)="query.set($event)"`.
>    Show the X button only when the query is non-empty: `@if (query())`.
>    Trigger clearing on `(mousedown)="clearSearch()"` (mousedown, not click, to avoid
>    stealing focus/blurring the input before the change registers).
>    Do NOT add a divider (`ssp-divider`), radar icon (`ssp-km-icon`), or km dropdown
>    (`ssp-select`) unless this search needs a radius filter.
>
> 2. **TS** — declare `public readonly query = signal<string>('');` and
>    `public clearSearch(): void { this.query.set(''); }`.
>    Add a `computed` that reads `query()` (lowercased, trimmed) and filters your list.
>    If there is a count badge, bind it to `filteredItems().length`, not the raw list length,
>    so it updates as the user types.
>
> 3. **SCSS** — copy the `.section-search-pill` block from `home.component.scss:160-250`:
>    - Pill: `display:inline-flex; align-items:center; height:30px; padding:0 8px 0 10px;
>      border:1px solid #e2e8f0; border-radius:999px; background:#f8fafc; box-sizing:border-box`
>    - Focus: `&:focus-within { background:#fff; border-color:#f97316;
>      box-shadow:0 0 0 2px rgba(249,115,22,0.12) }`
>    - `.ssp-icon`: `font-size:0.85rem; color:#94a3b8; margin-right:4px; flex-shrink:0`
>    - `.ssp-input`: `flex:1; min-width:0; border:none; background:transparent; font-size:0.76rem;
>      color:#0f172a; outline:none; &::placeholder { color:#94a3b8 }`
>    - `.clear-search-trigger`: `border:none; background:transparent; width:16px; height:16px;
>      padding:0; cursor:pointer; color:#94a3b8; display:inline-flex; align-items:center;
>      justify-content:center; border-radius:50%; margin-left:2px; flex-shrink:0`
>      with `mat-icon { font-size:0.8rem }` and `&:hover { color:#ef4444; background:rgba(239,68,68,0.1) }`
>
> 4. **Verify** — run `npx tsc --noEmit -p tsconfig.app.json` and confirm no type errors.