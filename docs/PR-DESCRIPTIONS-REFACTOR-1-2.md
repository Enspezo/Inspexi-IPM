# PR's voor refactor-branch 1 + 2

## Aanmaken (plak dit als prompt in Claude Code, in de InspeXi-Beheer repo)

```
Push de branches refactor/split-chat-service en refactor/split-generated-documents naar origin en maak met `gh pr create` twee PR's naar base-branch dev. Gebruik exact de titels en bodies uit docs/PR-DESCRIPTIONS-REFACTOR-1-2.md (PR 1 en PR 2 hieronder). Niet mergen.
```

Of handmatig:

```bash
git push origin refactor/split-chat-service refactor/split-generated-documents
gh pr create --base dev --head refactor/split-chat-service --title "refactor: split chat service into thread/sync/transcript sub-services" --body-file <(sed -n '/^<!-- PR1 -->$/,/^<!-- \/PR1 -->$/p' docs/PR-DESCRIPTIONS-REFACTOR-1-2.md)
gh pr create --base dev --head refactor/split-generated-documents --title "refactor: split generated-documents service + Zod validation for JSON columns" --body-file <(sed -n '/^<!-- PR2 -->$/,/^<!-- \/PR2 -->$/p' docs/PR-DESCRIPTIONS-REFACTOR-1-2.md)
```

---

<!-- PR1 -->
## Summary

Splits the 1449-line `ChatService` into focused sub-services, following the existing quotes/planning sub-service pattern (sub-service injects core, never the reverse; controller delegates).

- **ChatService (core, 458 lines):** shared org-scoped checks, thread access, sendMessage + notification dispatch
- **ChatThreadsService (274):** thread/message CRUD and queries, unread counts, read-marks
- **ChatSyncService (420):** sync snapshot pull, presence, `applySync*` writes incl. adopt/dedup flows (consumed by SyncModule)
- **ChatTranscriptsService (91):** thread close + transcript/notes creation
- **chat.helpers.ts (294):** DI-free helpers (mirrors `quotes.helpers.ts`)

## Behavior

**No behavior changes.** All 30+ method bodies were moved verbatim; the only mechanical edits are helper-call rewrites and `resolveReferenceNames(prisma, ...)` parameterization. Controller contract unchanged (9 routes, same decorators/Swagger). `sync.service.ts` only re-points its injection from `ChatService` to `ChatSyncService`.

## Tests

- 7 suites / 67 tests green (13 new cases: enablement, no-op close, searchUsers, dedup edge cases)
- `tsc --noEmit` clean

## Review notes (from pre-merge review)

- Nine previously-private core methods are now public (inherent to the pattern) — documented in the core service docstring.
- `chat.module.ts` exports all four services; only `ChatSyncService` is needed externally. Fine to tighten later.

🤖 Generated with Claude Code
<!-- /PR1 -->

---

<!-- PR2 -->
## Summary

Two parts:

**1. Split the 896-line `GeneratedDocumentsService`** (quotes/planning sub-service pattern):
- **GenerationContextService (501):** all context/query building. `PLAN_INCLUDE` split into `PLAN_HEADER_INCLUDE` and `PLAN_FULL_INCLUDE`, selected by `template.templateMode` — BLOCKS templates provably don't consume the plan context in the renderer (`document-render.service.ts:370`), so they skip the heavy findings/photos/measurement queries. SECTIONS builds the full context, line-for-line identical to `dev`.
- **DocumentSigningService (213):** signing flow (token, TTL, status transitions) — pure move, verified identical.
- **GeneratedDocumentsService (core):** CRUD, status, org-scoped checks.

**2. Zod validation for JSON columns** in the service layer and the `/sync` push:
- Permissive schemas (`common/validation/json-column.ts`): shape-only checks (object vs array), unknown keys pass through, `undefined` skipped on partial updates. Existing seed data and PWA v2 payloads conform.
- Covers all 8 JSON columns in the sync whitelist + REST create/update paths (asset-nodes, findings, plan metadata, visual-inspections, measurement-records, sheet-records).
- Failures: Dutch 400 on REST; per-record `errors[]` entry in the sync push (batch continues).

## Tests

- 6 suites / 71 tests green (new: `document-signing.service.spec.ts`, `json-column.spec.ts`, sync-mapper JSON tests)
- `tsc --noEmit` clean
- E2E not run in this branch — run once on the merged state

## Review notes (from pre-merge review)

- ⚠️ **Follow-up issue needed:** the block renderer emits unfilled `{{placeholder}}`/`FINDINGS_TABLE` tokens (pre-existing on dev). When that fill-step gets built, BLOCKS must switch back to the full context. The assumption is documented in the `generation-context.service.ts` file header.
- PWA cutover note: a legacy Dexie row with object-shaped `checklistResults` (instead of array) would now fail server-side per record — real app code never writes that shape; add to the v3-cutover checklist.
- Minor: `generateDocument` fetches the plan twice (lite + full) — one extra cheap query.

🤖 Generated with Claude Code
<!-- /PR2 -->
