# PR's voor refactor-branch 3 + 4

Aanmaken (prompt voor Claude Code):

```
Push de branches refactor/shared-frontend-package en refactor/query-keys-and-ux-hygiene naar origin en maak met `gh pr create` twee PR's naar base dev, met de titels en bodies uit docs/PR-DESCRIPTIONS-REFACTOR-3-4.md. Merge-volgorde (niet zelf mergen): eerst shared-frontend-package, daarna query-keys-and-ux-hygiene rebasen (verwacht alleen een triviale package.json/lockfile-merge).
```

---

<!-- PR3 -->
**Titel:** `refactor: extract shared-web package for api-client core, format, status and download utils`

## Summary

New workspace package `packages/shared-web` (source-package pattern, same as `@inspexi/ui` — no build step, Vite transpiles) deduplicating portal ⇄ client-portal:

- **api-client-core** with injectable adapters: portal keeps its `isInitializing` flag + `/login` redirect; client-portal keeps single-flight `refreshPromise` + `clearTokens` CustomEvent. Auth semantics verified line-by-line against dev — identical (401→refresh→retry, single-flight, FormData upload, `{success,data}` unwrap).
- **format.ts** (superset, nl-NL, `'—'` fallback), **status.ts** (shared maps + `getStatusConfig`), **download** util.
- Thin per-app re-export shims: no existing `@/lib/*` import breaks.
- Types: only provably shared interfaces moved (`ApiError`); rest split per domain with re-exports, zero renames.

## Verification

- `tsc -b` green for portal and client-portal; portal vitest 270/270 green.

## Review notes (pre-merge review)

- Client-portal `formatFileSize` now scales to GB/TB (dev stopped at MB) — cosmetic improvement, noted as intentional.
- Portal retry no longer sends a literal `Bearer undefined` when a refresh response lacks a token (degenerate edge; strictly better).

🤖 Generated with Claude Code
<!-- /PR3 -->

---

<!-- PR4 -->
**Titel:** `refactor: query-key factories, default mutation error toasts, bundle splitting`

## Summary

**1. Query-key factories** (`lib/query-keys.ts` in portal ~70 domains + client-portal): all hooks migrated; invalidations always via factory. Keys are deliberately kept byte-identical to the historical arrays, so the migration is behavior-neutral by construction. Verified: invalidation count unchanged (372→374, +2 are doc comments), zero broad→narrow regressions, no list lost its params.

**2. `use-api-mutation` default `onError`** → Dutch toast via `getErrorMessage` (fallback "Er is iets misgegaan"), caller `onError` replaces the default (no double toasts by construction). 237 files migrated; 0 raw `useMutation` imports left in the portal; stale local catch-toasts cleaned up.

**3. Bundle hygiene (portal):** `manualChunks` for docx-preview/xlsx/konva; heavy preview components lazy (measured: preview chunk 343→9 kB gzip, floor-plan 323→27 kB); `rollup-plugin-visualizer` behind `ANALYZE=1`; real class ErrorBoundary + async catch around DocxPreview (corrupt file ⇒ inline NL error, no page crash).

## Verification

- Portal + client-portal `tsc` green; portal vitest 270/270 green.
- Overlap with shared-frontend-package branch: only `apps/portal/package.json` + lockfile — trivial merge. Merge that branch first, then rebase this one.

## Known follow-ups (non-blocking, from pre-merge review)

- [ ] 2 literal query keys left in client-portal (`tenant-provider.tsx:122` org-branding, `lib/lookups.ts:38` lookups) — migrate to the factory.
- [ ] Rename `inspectionTemplateKeys1`.
- [ ] Key hierarchy is flat (`lists()` ≡ `all`, `detail(id)` without segment) — real hierarchy is a future, separately-tested change.
- [ ] Client-portal has no central mutation error handling (part 2 landed portal-only).
- [ ] 7 optimistic-rollback hooks (reorder flows) still fail without a toast (same as dev).

🤖 Generated with Claude Code
<!-- /PR4 -->
