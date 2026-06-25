# IMP_PRD-11 — Inspecteur-certificaten/diploma's — Oplevernotitie

> Branch `feat/inspector-certificates`. Voorgestelde PR-titel:
> **`feat: implement PRD-11 — inspector certificates & diplomas`**

Rol-specifieke datalaag voor `INSPECTEUR`-gebruikers: diploma's/certificaten
(Soort, Datum, Nummer optioneel, Geldig tot optioneel, Instantie) met een
optioneel **privé-document**. Bereikbaar op twee plekken: **Inspecties →
Inspecteurs** en **Organisatie → Gebruikers → \<gebruiker\> → tab "Certificering"**.
Op zichzelf staande module — géén generiek polymorf framework, en strikt
gescheiden van het generieke `/documents` DMS.

## Permissiemodel

| Actor | Lezen/downloaden (`canView`) | Schrijven (`canWrite`) |
|---|---|---|
| Self (eigen certificaten) | ✓ | ✓ |
| SUPERUSER / ORG_ADMIN | ✓ | ✓ |
| MANAGER | ✓ | ✗ (read-only) |
| BACKOFFICE / WERKVOORBEREIDER | ✗ (alleen eigen) | ✗ |

Cross-tenant id's geven **404** (geen bestaan prijsgeven); aanmaken voor een
inspecteur uit een andere org geeft **403**. Gate: `@RequiresFeature('BASIS_INSPECTIES')`.

## Migratie

`20260625113028_add_inspector_certificates` — tabel `imp_inspector_certificates`
(FK's → `imp_organizations`, `imp_users`; indexes `(org_id,user_id)` + `(user_id)`).

## Nieuwe / gewijzigde bestanden

**Backend**
- `prisma/schema.prisma` — model `InspectorCertificate` + backrelaties (User/Organization)
- `prisma/migrations/20260625113028_add_inspector_certificates/`
- `src/modules/inspector-certificates/` — controller, service, module, `dto/`, `.spec.ts`
- `src/app.module.ts` — module geregistreerd
- `src/common/audit/audited-entities.ts` (+ `.spec.ts`) — audit-registratie (`type`/`issuer`)
- `prisma/seed.ts` — cleanup + 2 demo-certificaten + `makeCertificatePdf()` helper
- `test/inspector-certificates.e2e-spec.ts` (nieuw), `test/cross-tenant.e2e-spec.ts` (uitgebreid)

**Frontend (portal)**
- `src/types/index.ts` — `InspectorCertificate`
- `src/lib/download-file.ts` — `downloadFromPath` + `downloadCertificateDocument`
- `src/lib/status.ts` — `CERTIFICATE_VALIDITY` + `getCertificateValidityKey`
- `src/lib/api-client.ts` — `upload(...)` accepteert nu `POST|PATCH|PUT`
- `src/pages/inspectors/hooks/use-inspector-certificates.ts`
- `src/components/inspector-certificates/` — sectie + create/edit-modal
- `src/pages/inspectors/inspectors-page.tsx` + `inspector-detail-page.tsx`
- `src/components/layout/sidebar.tsx`, `src/App.tsx` — nav + routes (BASIS_INSPECTIES)
- `src/pages/users/user-detail-page.tsx` — tab "Certificering" (alleen voor inspecteurs)

## Testresultaten

- `npx turbo run build` (root): **5/5 successful** ✓
- API unit (`pnpm test`): **88 suites / 1372 tests** ✓ (21 nieuw)
- E2e: `inspector-certificates` **21/21** ✓, `cross-tenant` **80/80** ✓ (3 nieuw)
- Portal (`pnpm test`): **22 files / 229 tests** ✓
- Document-isolatie geverifieerd: 0 rijen in `imp_documents` verwijzen naar
  certificaat-opslag; `DocumentEntityType` kent geen `CERTIFICATE` → het
  certificaatbestand is niet zichtbaar/downloadbaar via `/documents`.

## Handmatige browser-smoketests (door gebruiker, op `inspexidemo.localhost:5173`)

a. `inspecteur@inspexi-demo.nl` → Inspecties → Inspecteurs → certificaat + document toevoegen.
b. `admin@inspexi-demo.nl` → Gebruikers → inspecteur → tab "Certificering" bewerken.
c. (geverifieerd in DB) certificaatdocument staat niet in `/documents`.

Seed levert al 2 demo-certificaten voor `inspecteur@inspexi-demo.nl`: één geldig
(VCA-VOL, ~3 jaar, mét downloadbaar PDF) en één dat binnen 30 dagen verloopt
(NEN 3140 VP, zonder document).
