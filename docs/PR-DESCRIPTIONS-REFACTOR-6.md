# PR voor refactor-branch 6 (soft-delete fase 1)

Aanmaken (prompt voor Claude Code):

```
Push branch refactor/soft-delete-standardization naar origin en maak met `gh pr create` een PR naar base dev, met de titel en body uit docs/PR-DESCRIPTIONS-REFACTOR-6.md. Niet mergen. Na de merge: draai eenmalig `pnpm test:e2e` op de gemergde staat (docker compose up -d eerst).
```

---

<!-- PR6 -->
**Titel:** `feat(soft-delete): phase 1 — inventory, missing filters, tombstone retention cron`

## Summary

Phase 1 of the soft-delete standardization (analysis + foundation, deliberately **no schema changes**). Six commits:

**1. Inventory & phase 2 proposal** (`docs/SOFT-DELETE-INVENTORY.md`)
Per-model mechanism (`isDeleted` vs `deletedAt` vs both), which services filter, sync participation; risk-sorted list of missing filters; documented "deliberately NOT changed" cases (admin views, to-one includes); executable expand/contract migration proposal for phase 2 (not executed).

**2. Missing soft-delete filters fixed** (verified genuine omissions only)
- Relation includes/counts: assets, generation-context, projects, visual-inspections — counts now match the filtered lists below them.
- Name-enrichment lookups (documents/tasks/notes/search): soft-deleted entities degrade to `entityName: null`.
- `_count` fixes: project-phases (`inspectionPlans` excl. tombstoned), document-tags (`documents` excl. soft-deleted).
- `/sync` pull untouched: tombstones keep flowing to the PWA.

**3. Tombstone retention cron** (daily 03:00, `TombstoneCleanupService`)
Hard-deletes sync tombstones older than 90 days in FK-safe child→parent order.
- **Restrict-FK guards** on parents (`planScopes` on assetNode; `reports`/`generatedDocuments`/`measurementSheetRecords` on inspectionPlan): blocked parents are skipped, converge bottom-up on later runs — one blocked row can never fail the batch.
- Guards are **schema-derived in tests** via `Prisma.dmmf` (incl. the implicit Restrict default): adding a new unguarded required relation to a purged model fails CI.
- Per-step `safeDelete` + cron-level try/catch (no unhandled rejections); kill-switch `TOMBSTONE_CLEANUP_ENABLED` (documented in `.env.example`).
- Only touches the 7 `deletedAt` sync entities — core CRM (`isDeleted`) is out of scope.

## Known limitations (documented in the inventory, §risks)

- **Resurrect risk:** a PWA device offline >90 days misses the purged tombstone and can resurrect a record via idempotent push-adoption. Mitigation proposal documented (full re-pull after long offline period); 90 days is deliberately generous vs. realistic offline duration.
- **Photo/storage orphans:** `Photo` is polymorphic (no FK) — purging leaves photo rows + storage files behind. Known follow-up.

## Verification

- 107 tests green (7 suites, incl. DMMF-invariant tests and scenario tests for all three Restrict cases); `tsc --noEmit` clean.
- E2E not run on this branch — **run `pnpm test:e2e` once on the merged state.**

## Follow-ups (separate issues)

- [ ] Phase 2: `isDeleted` → `deletedAt` migration on core CRM models (proposal in `docs/SOFT-DELETE-INVENTORY.md`)
- [ ] Photo/storage orphan cleanup for purged sync records
- [ ] Full re-pull for devices offline beyond the tombstone horizon (v3-cutover checklist)
- [ ] `organizations.service.ts` `_count.users` includes soft-deleted users (superuser admin view — decide intended behavior)

🤖 Generated with Claude Code
<!-- /PR6 -->
