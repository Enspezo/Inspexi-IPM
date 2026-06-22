# Refactor — Next Round (start here)

> Pick-up note for the next refactoring round. Round 1 = **12 PRs merged** (#52–63); `dev` green
> (API unit 1211 · e2e 629 · portal 206 · build 4/4). Full context: `AUDIT.md` (findings + IDs),
> `PLAN.md` (status), `SUMMARY.md` (what shipped + risk notes).

## Decision needed first (unblocks the #1 item)

**DEDUP-1 display format.** Consolidating the 5 `enrichWithEntityNames` copies is the last *high-value*
item, but it changes user-visible display strings on 6 surfaces (tasks/notes/documents/search/favorites/audit),
because the existing `common/audit` `ENTITY_DISPLAYS` renderer differs from the hand-rolled ones. Decide the
desired per-type string, then consolidate. Suggested target (keep the richer hand-rolled behavior):
- Contact → `companyName || "firstName lastName" || email`
- Project → `"projectNumber — title"` (don't drop the title)
- Location → address (`street houseNumber city`) || name
- include PROJECT + USER in search (currently omitted)

## Prioritized pick-up list

1. **DEDUP-1 + DEDUP-2 + PERF-7/8** — after the format decision: one shared `enrichEntityNames()` over
   `ENTITY_DISPLAYS`/`delegateFor` (favorites already uses it) + shared `ENTITY_REF` map; add per-model `select`
   to the FK batch-lookups (removes the audit/favorites over-fetch). Touches tasks/notes/documents/search/favorites/audit. *High value, behavior-visible — update snapshots/tests.*
2. **Small safe dedups** — `DUP-5` Word/DOCX MIME constant → `@/common/constants/mime-types.ts`; `CONV-6` search
   local `orgScope` shadow → shared helper; `DUP-6` backend `formatDateNL` (~6 inline copies). *Low risk, batchable.*
3. **FE shared-lib sweep** — `FE-7` ~87 inline `toLocale*` date calls → `lib/format` (promote `formatDateTimeLong`);
   `FE-8` `getContactName` (~10 reimplementations); `FE-9` local status maps in `planning-public-page` → `lib/status`.
4. **FE query hooks** — `FE-4/5`: `link-entities-modal` + the two debounced contact/planning search inputs → `useQuery`.
5. **Backend splits** — `SPLIT-2` measurement-validation engine (**first** export shared snapshot/record types to break the
   `ReturnType<typeof this.x>` coupling); then `SPLIT-1` planning lifecycle, `SPLIT-3` locations.
6. **FE splits** — `FE-12` document-preview-modal per-MIME renderers; `FE-14` search-page columns; `FE-16` `types/index.ts` by domain.
7. **High-risk, schedule deliberately** — `PERF-6` sync push/resolve batching (conflict + parent/child ordering — needs focused tests).

## Resume recipe (per PR)

Branch from current `dev` → implement → `cd apps/api && npx tsc --noEmit` + full `pnpm test`/`test:e2e` + root `npx turbo run build` green → `gh pr create --base dev` → `code-review` (+`security-review` if multi-tenant/auth) subagent → address findings → merge + delete branch + tick `PLAN.md`.

## Carry-forward gotchas

- **e2e shares one DB** — repeated full runs accumulate fixtures; if `quotes.e2e "delete fails for non-CONCEPT"` fails, `pnpm db:seed` and re-run (it's a fragile page-1-of-list assertion, not a regression).
- **No `noUnusedLocals`** — removing a method can orphan an exception import; drop it for cleanliness (build won't fail).
- **Lint unrunnable** (eslint not configured) → verify with `tsc -b` + build.
- **Projects controller returns entities unwrapped** (no `{success,data}`) unlike notes/quotes/requests — a separate contract-consistency fix worth doing.
- Migrations only via `cd apps/api && npx prisma migrate dev` — never `db push`.
