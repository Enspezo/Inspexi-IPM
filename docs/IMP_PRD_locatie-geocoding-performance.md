# PRD — Locatie-geocoding & kaart-performance

> Status: **Concept / backlog** · Domein: CRM-locaties + kaart (REQ32) · Taal: NL (PRD), EN (code)
> Opgesteld n.a.v. trage eerste-load van de locatie-kaart op `/contacts/locations`.

## 1. Context & probleem

Sinds REQ32 ([PR #38](https://github.com/Enspezo/Inspexi-IPM/pull/38)) heeft de locatie-overzichtspagina een kaart-weergave. De kaart heeft per locatie `lat`/`lng` nodig.

**Hoe het nu werkt:**
- Locaties **zónder** `lat`/`lng` worden **client-side** geocode via Nominatim in `apps/portal/src/lib/geocode.ts` — **sequentieel, met 350 ms pauze** tussen elk adres (Nominatim staat ~1 req/sec toe) + de netwerk-round-trip (~0,3–1 s per adres).
- Gevonden coördinaten worden teruggeschreven naar de DB via `persistLocationCoords()` → `PATCH /contacts/locations/:id` (zie `locations.service.ts#updateLocation`, tak "expliciete coords"). De **tweede** keer openen is dus snel.
- Locaties die via de UI worden aangemaakt krijgen al coördinaten bij create (`locations.service.ts#resolveCoords`: expliciet → PDOK-centroïde → Nominatim).

**Waar de pijn zit:**
1. **Seed- en bulk-import-locaties komen zónder coördinaten de DB in** (`prisma/seed.ts` schrijft `prisma.location.create` direct, zonder geocoding). Bij de eerste kaart-open worden die allemaal één-voor-één geocode.
2. De **sequentiële 350 ms-throttle schaalt slecht**: 5 locaties ≈ ~4 s, 50 ≈ ~40 s, 200 ≈ ~3 min.
3. **`pnpm db:seed` wist alle coördinaten** weer (seed zet ze niet) → demo is telkens opnieuw traag.
4. De **INSPECTEUR-rol** mag niet `PATCH /contacts/locations/:id` (`OFFICE_ROLES`), dus voor die rol worden gevonden coördinaten **niet** opgeslagen (403, fail-soft) → blijft elke sessie opnieuw geocoden.

**Meetwaarde (dev-DB, 2026-06-20):** 7 demo-locaties, **2 mét** en **5 zónder** coördinaten.

## 2. Doel

- De locatie-kaart opent **< ~1–2 s**, ongeacht het aantal locaties.
- In de normale flow is **geen client-side bulk-geocoding** meer nodig.
- De **demo** laadt direct.
- Bestaande locaties zonder positie kunnen in **één bewuste actie** (of automatisch) van coördinaten worden voorzien.

## 3. Scope

**In scope:** vaste seed-coördinaten; server-side bulk-backfill van ontbrekende coördinaten; coördinaten garanderen bij import/aanmaak.
**Out of scope (apart traject):** wereldwijde adressen (we blijven NL/PDOK); marker-clustering / rendering-performance bij heel veel punten op de kaart (signaleren, niet hier oplossen).

---

## 4. Oplossing A — Seed-coördinaten (quick win)

Geef de demo-locaties in `apps/api/prisma/seed.ts` vaste `lat`/`lng` mee, zodat de demokaart direct laadt en niets hoeft te geocoden.

**Requirements**
- A1. Alle in de seed aangemaakte `Location`-rijen krijgen realistische `lat`/`lng` (NL-coördinaten passend bij het adres).
- A2. Geen netwerk-calls in de seed (vaste waarden hardcoden; geen geocoding tijdens seeden).
- A3. Optioneel ook `pdokData` meegeven voor consistentie (niet vereist).

**Technische aanwijzing**
- Bestand: `apps/api/prisma/seed.ts`, de 7 `prisma.location.create({ ... })`-blokken (zoek op `name: 'Kantoorpand Zuidas'` e.d.). Voeg `lat`/`lng` toe naast `locationTypeId`.

**Acceptatie**
- Na `pnpm db:seed` heeft **elke** locatie `lat`/`lng` (`SELECT count(*) FILTER (WHERE lat IS NULL) FROM imp_locations;` = 0).
- De kaart op `inspexidemo.localhost:5173/contacts/locations` toont alle punten **zonder** geocode-voortgangsbalk.

**Inschatting:** XS (≈ 30 min).

---

## 5. Oplossing B — Server-side bulk-backfill (structureel)

Een server-side actie die **alle locaties van een org zonder `lat`/`lng`** in één keer geocodet via **PDOK** (de Nederlandse locatieserver — sneller en zonder 1/sec-limiet) en de coördinaten + `pdokData` opslaat. Daarna hoeft de kaart vrijwel nooit meer live te geocoden.

**Requirements**
- B1. **Endpoint** (voorkeur) `POST /contacts/locations/geocode-missing` — org-scoped, `@Roles(...OFFICE_ROLES)` (of `ORG_ADMIN`). Geocodet alle eigen locaties met `lat IS NULL OR lng IS NULL`.
- B2. Gebruik **PDOK** via `GeocodingService` (`apps/api/src/modules/geocoding/geocoding.service.ts`): `PDOK_BASE` locatieserver `search`/`free` op de volledige adresstring → `extractCoordsFromPdokData()` (WKT `centroide_ll`). Val terug op `nominatimGeocode()` alleen als PDOK niets vindt.
- B3. **Bescheiden parallelisme** (bijv. 5 gelijktijdig) i.p.v. de client-side 350 ms-sequentie; nette `User-Agent`; time-outs + retries.
- B4. **Idempotent & herhaalbaar:** slaat al-gevulde locaties over; tweede run is een no-op.
- B5. **Foutafhandeling:** niet-vindbare adressen blijven `null` en worden geteld; respons rapporteert `{ verwerkt, gevonden, nietGevonden }`. Geen harde fout op één onvindbaar adres.
- B6. Schrijft per locatie `lat`, `lng` en (indien beschikbaar) `pdokData` weg (hergebruik `updateLocation`-logica of directe `update`).
- B7. **Frontend-trigger:** knop "Ontbrekende kaartposities ophalen" op de kaart-/lijstweergave (alleen zichtbaar bij office/admin), die het endpoint aanroept en daarna `queryClient.invalidateQueries(['locations'])`. Toon resultaat als toast.
- B8. (Optioneel) Een **CLI-/migratie-script** voor ops om de backfill voor één of alle orgs te draaien zonder UI.

**Technische aanwijzingen / raakvlakken**
- `apps/api/src/modules/geocoding/geocoding.service.ts` — `suggest()`, `lookup()`, `nominatimGeocode()`, `extractCoordsFromPdokData()`, `PDOK_BASE`. Voeg evt. een `geocodeAddress(street, houseNumber, postalCode, city)`-methode toe die PDOK direct bevraagt (i.p.v. suggest→lookup in twee stappen).
- `apps/api/src/modules/contacts/locations.service.ts` — nieuwe `geocodeMissing(user)`-methode + controllerroute in `contacts.controller.ts` (let op: specifieke route vóór `:id`-routes plaatsen).
- `apps/portal/src/pages/contacts/components/locations-map.tsx` / `locations-page.tsx` — de trigger-knop + invalidate.
- De client-side geocoder (`lib/geocode.ts`) **blijft als vangnet** bestaan voor incidentele locaties zonder positie.

**Acceptatie**
- Eén org met N coördinaatloze locaties is na één aanroep voor het overgrote deel gevuld; tweede aanroep = no-op.
- Geocoden van ~100 adressen via PDOK is in **seconden** klaar (niet minuten).
- Respons rapporteert aantallen; onvindbare adressen blijven zichtbaar als "zonder kaartpositie".

**Inschatting:** M (≈ 0,5–1 dag).

---

## 6. Oplossing C — coördinaten garanderen bij import/aanmaak (optioneel)

Zorg dat **elk** pad dat locaties aanmaakt coördinaten oplevert, zodat de DB niet opnieuw volloopt met coördinaatloze rijen.

**Requirements**
- C1. Bulk-import/CSV-paden (indien aanwezig of toekomstig) laten lopen via `resolveCoords()` of een post-import aanroep van de backfill (B).
- C2. Documenteer dat directe `prisma.location.create` (zoals in seed/scripts) geen coördinaten zet — gebruik de service of vul ze expliciet.

**Inschatting:** S, afhankelijk van of er al een importpad is.

---

## 7. Aandachtspunten & risico's

- **Nominatim** heeft ~1 req/sec-limiet en vereist een `User-Agent` — daarom is PDOK de voorkeur voor bulk; Nominatim alleen als fallback.
- **PDOK** dekt alleen NL-adressen. Buitenlandse adressen → Nominatim-fallback of leeg laten (tellen als "zonder positie").
- **Rollen:** de huidige `PATCH /contacts/locations/:id` is `OFFICE_ROLES` (geen INSPECTEUR). De backfill draait dus als office/admin of als systeemtaak; client-side persist voor INSPECTEUR blijft fail-soft.
- **Reseed** wist coördinaten — Oplossing A lost dit voor de demo op.
- **Veel markers** op de kaart (honderden+) kan los van geocoding traag renderen → toekomstige marker-clustering (bijv. leaflet.markercluster); buiten scope, hier alleen gesignaleerd.
- **Privacy/AVG:** coördinaten zijn afgeleide adresgegevens; geen extra PII, maar wel org-scoped opslaan (al geborgd via bestaande tenant-isolatie).

## 8. Definition of Done (samengevat)

- [ ] **A:** seed geeft alle locaties `lat`/`lng`; demokaart laadt zonder geocoding.
- [ ] **B:** `POST /contacts/locations/geocode-missing` (PDOK, parallel, idempotent, gerapporteerd) + UI-knop + invalidate; ~100 adressen in seconden.
- [ ] **C (optioneel):** importpaden garanderen coördinaten of triggeren de backfill.
- [ ] Unit-/e2e-tests voor de backfill (incl. cross-tenant: alleen eigen org); `npx turbo run build` groen.
- [ ] Client-side geocoder blijft als vangnet bestaan.

## 9. Fasering

1. **Fase 1 (quick win):** Oplossing A — los te leveren, direct merkbaar voor de demo.
2. **Fase 2 (hoofdmoot):** Oplossing B — endpoint + UI-knop + PDOK-backfill.
3. **Fase 3 (optioneel):** Oplossing C — borgen bij import/aanmaak.

## 10. Referenties

- REQ32 kaart-weergave: [PR #38](https://github.com/Enspezo/Inspexi-IPM/pull/38) — `components/map/entity-map.tsx`, `lib/geocode.ts`, `pages/contacts/components/locations-map.tsx`.
- Backend geocoding: `apps/api/src/modules/geocoding/geocoding.service.ts` (PDOK + Nominatim).
- Coords bij create: `apps/api/src/modules/contacts/locations.service.ts#resolveCoords`.
- Save-back route: `PATCH /contacts/locations/:id` (`contacts.controller.ts`).
