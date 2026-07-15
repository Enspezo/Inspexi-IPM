# PRD-12 — Implementatieplan Beschikbaarheid Inspecteurs

*Gefaseerd implementatieplan bij `IMP_PRD_12_Beschikbaarheid-Inspecteurs.md`*
*Versie 1.0 | Juli 2026*

Elke fase is zelfstandig opleverbaar (build groen, tests groen) en eindigt met een verificatiestap. Volgorde is bindend: fase 2 bouwt op het schema van fase 1, fase 3 op de API van fase 2, fase 4 op alles.

---

## Fase 1 — Schema, dienstvorm & templates (API)

**Doel**: datamodel staat, templates zijn via de API te beheren, dienstvorm is per gebruiker instelbaar.

1. **Prisma-schema** (`apps/api/prisma/schema.prisma`):
   - Enums `EmploymentType`, `AvailabilityExceptionType`.
   - Modellen `AvailabilityTemplate`, `AvailabilityTemplateSlot`, `UserScheduleAssignment`, `AvailabilityException` (incl. exception-model alvast — voorkomt een tweede migratie in fase 2). Alle met `@@map("imp_…")`.
   - `User.employmentType EmploymentType?` + relaties.
   - Migratie **vanuit `apps/api/`**: `npx prisma migrate dev --name add-inspector-availability` (nooit `db push`).
2. **Seed** (`prisma/seed.ts`): cleanup-volgorde `availabilityException → userScheduleAssignment → availabilityTemplateSlot → availabilityTemplate` (vóór `user`/`organization`); seed-data conform PRD 12.10.
3. **Module `availability`** (`apps/api/src/modules/availability/`): module + registratie in `app.module.ts`.
   - `availability-templates.service.ts` + CRUD-endpoints (PRD 12.6), `@Roles` op MANAGEMENT_ROLES, `orgScope`/`paginate`/`assertFound`/`assertSameOrg` uit `@/common`.
   - Slot-validatie (geen overlap per weekdag, `startMinute < endMinute`), delete-guard bij actieve toewijzingen (409).
   - Schema-toewijzing-endpoints (`GET/PUT/DELETE /availability/users/:userId/schedule`) in `user-schedules.service.ts`; `PUT` sluit lopende toewijzing af in een transactie.
4. **Users-module**: `UpdateUserDto` + service uitbreiden met `employmentType`; alleen MANAGEMENT_ROLES mag dit veld wijzigen (403 anders).
5. **Audit**: alle drie de nieuwe modellen registreren in `AUDITED_MODELS`/`MODEL_TABLE_MAP`; FK-resolvers + `ALLOWED_ENTITY_TYPES` in `audit-log.service.ts`.
6. **Tests**: unit-specs voor beide services; `availability.e2e-spec.ts` (templates + schedule CRUD, rollen-checks); `cross-tenant.e2e-spec.ts` uitbreiden (vreemde `templateId`/`userId` → 403). E2E-conventies: `e2e-`-prefix, teardown in `try/finally`, opruimvolgorde conform seed.

**Verificatie**: `npx turbo run build` + `pnpm test` + `pnpm test:e2e` groen; Swagger toont nieuwe endpoints; handmatige curl-smoketest met `Host: inspexidemo.localhost`.

---

## Fase 2 — Uitzonderingen & resolutie-engine (API)

**Doel**: excepties beheerbaar, resolved availability en check opvraagbaar, notificaties actief.

1. **`availability-exceptions.service.ts`** + CRUD-endpoints (PRD 12.6):
   - Autorisatie in de service: niet-managers alleen `userId === currentUser.id` (403 anders); MANAGEMENT_ROLES alles binnen de org.
   - DTO-validatie: eenmalig XOR herhalend (custom validator), veldregels uit PRD 12.4.
2. **`availability-resolution.service.ts`**: pure functies (geen Prisma-afhankelijkheid in de kern):
   - `mergeIntervals`, `subtractIntervals`, `expandRecurring(exception, date)`, `resolveDay(baseline, exceptions)`.
   - Wrapper die per user+datumbereik templates/toewijzingen/excepties ophaalt (batched, géén query per dag) en dagresultaten met `sources` teruggeeft.
3. **Endpoints** `GET /availability/resolved` (max 3 maanden, `userIds` batch) en `GET /availability/check` — `@Roles` op CRM_ROLES.
4. **Notificaties**: enum-waarden `BESCHIKBAARHEID_GEWIJZIGD_DOOR_INSPECTEUR` / `_DOOR_MANAGER` + dispatch (fire-and-forget) in de exceptions/schedule-services; NotificationPref-groepen + NL-labels.
5. **Tests**: uitgebreide unit-suite op de resolutie (dit is het risicozwaartepunt — alle gevallen uit PRD 12.10); e2e voor exceptions-autorisatie (zelf vs. ander), resolved en check.

**Verificatie**: builds + tests groen; handmatig scenario via curl: freelancer zonder excepties → lege dagen; dienstverband + wekelijkse blokkade ma 01:00–05:00 → juiste intervallen.

---

## Fase 3 — Portal-UI

**Doel**: beheer-GUI's voor manager en inspecteur, inclusief kalenderweergave.

1. **Types & hooks**: interfaces in `apps/portal/src/types/index.ts`; `pages/availability/hooks/use-availability.ts` met alle query/mutatie-hooks (TanStack Query, invalidation-patroon). Status-map `AVAILABILITY_EXCEPTION_TYPE` + `EMPLOYMENT_TYPE` in `lib/status.ts`.
2. **Templates-beheerpagina** (`pages/organization/availability-templates-page.tsx`): overzichtspatroon (`DetailPageLayout`/`TableConfigSidebar`/`useTableConfig`); editor met weekdag-slots en uren/week-teller; lazy route in `App.tsx`; sidebar-item (MANAGEMENT_ROLES) onder Organisatie.
3. **`UserAvailabilitySection`** (`components/availability/`): dienstvorm, weekschema-toewijzing, excepties-lijst + toevoegen/bewerken-modal (eenmalig/herhalend), maandkalender-preview op resolved data (native `Date`, patroon `planning-calendar-view.tsx`). Props `userId` + `canManage`.
4. **Inbouwen**: tab `beschikbaarheid` op `user-detail-page.tsx` (met `<AuditHistory>` in de sidebar); nieuwe pagina `/my-availability` voor rol INSPECTEUR (zelfde sectie, `canManage=false`) + sidebar-item.
5. **Audit-frontend**: NL-veldlabels (`lib/audit-field-labels.ts`) en enum/waarde-formatting (`lib/audit-value-format.ts`).
6. **Tests**: Vitest voor interval/patroon-formatting en modal-validatie.

**Verificatie**: `npx turbo run build` groen; browser-smoketest als manager (template maken, dienstvorm zetten, blokkade voor inspecteur) én als `inspecteur@inspexi-demo.nl` (eigen blokkade toevoegen → notificatie bij manager zichtbaar).

---

## Fase 4 — Planning-integratie & afronding

**Doel**: de planning gebruikt beschikbaarheid (soft warnings + kalender-overlay); documentatie bijgewerkt.

1. **Backend**: `AvailabilityService.check`-aanroep in `PlanningService.assignInspectors` en `PlanningSessionsService.assignSessionInspectors`; `overrideAvailabilityWarnings` op de assign-DTO's; 409-met-warnings-response; override loggen in `PlanningHistory` (`AVAILABILITY_OVERRIDE`). Ook checken bij `reschedule` (datum wijzigt → conflicten opnieuw beoordelen).
2. **Portal — assign-flow**: 409-warnings afvangen in de assign-modal; `useConfirm()`-dialoog met per-inspecteur uitleg; bevestigen → retry met override-vlag.
3. **Portal — kalender**: beschikbaarheids-overlay in `planning-calendar-view.tsx` bij inspecteur-filter (resolved data voor zichtbaar bereik, gedempte niet-beschikbare dagen); "Niet beschikbaar"-badge in de inspecteur-picker.
4. **Tests**: planning-e2e uitbreiden (assign met conflict → 409, override → toegewezen + history-record); unit-tests op de check-integratie.
5. **Documentatie**: `CLAUDE.md` bijwerken (nieuwe module, modellen, seed-opruimvolgorde, gotcha "GEBLOKKEERD wint altijd; freelancers zijn standaard niet beschikbaar").
6. **Eindverificatie**: volledige suite (`pnpm test`, `pnpm test:e2e`, portal-tests, `npx turbo run build`) + browser-smoketest end-to-end: blokkade aanmaken → inplannen op die dag → waarschuwing → override → history toont override.

---

## Risico's & aandachtspunten

| Risico | Mitigatie |
|---|---|
| Interval-wiskunde fout (randgevallen, weekintervallen) | Pure functies, uitputtende unit-tests vóór endpoints (fase 2, stap 2 vóór stap 3) |
| Naamcollisie met bestaande chat-enum `Availability` | Nieuwe namen (`AvailabilityTemplate`/`AvailabilityException`/`EmploymentType`); nergens de bestaande enum aanraken |
| Performance resolved-endpoint bij veel inspecteurs × dagen | Batched queries per bereik, bereik-limiet 3 maanden, berekening in-memory |
| Planners omzeilen warnings routinematig | Override wordt gelogd in PlanningHistory → zichtbaar in geschiedenis-tab |
| Migratieketen breken | Uitsluitend `migrate dev` vanuit `apps/api/`, nooit `db push` |
