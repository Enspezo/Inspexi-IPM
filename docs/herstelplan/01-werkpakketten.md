# Werkpakketten — detailspecificatie

Per pakket: bevindingen, root cause (geverifieerd tegen de actuele code), aanpak, acceptatiecriteria en verplichte tests. Bestandspaden zijn relatief aan de repo-root van de genoemde repo.

Legenda repo: **API/portal/client-portal** = `InspeXi-Beheer` · **PWA** = `Inspexi-App`

---

# GOLF 1 — Blokkerend + force multipliers

## WP-A1 · Sync-fouten zichtbaar maken (PWA)

**Bevindingen:** B-211 (S2), B-208 (S2), B-223b (S3)
**Waarom eerst:** zolang een mislukte push stil blijft, is geen enkele volgende PWA-fix betrouwbaar te valideren — en herhaalt deze klasse zich bij de volgende contractwijziging.

**Root cause.** Alles in één bestand, `src/features/sync/SyncContext.tsx`:
- Het statuseffect eindigt op `}, [isOnline, syncState])`; `checkStatus()` zet onvoorwaardelijk `pending` zodra er pending changes zijn. Omdat `syncState` zelf in de deps staat, draait `checkStatus()` direct ná `setSyncState("error")` → de foutstatus wordt binnen dezelfde tick overschreven en de rode banner in `Layout.tsx` is nooit waar (B-211).
- Het auto-sync-effect is `useEffect(… , [isOnline, user])` met een guard op `pendingCount`, maar die teller wordt alleen door de 30 s-`setInterval` bijgewerkt → direct na een offline mutatie is hij nog 0 en het effect herdraait niet (B-208).
- Diezelfde poll maakt de pending-teller 30 s achterlopend (B-223b).

**Aanpak.**
1. `syncState` uit de dependency-array; gebruik functionele state-updates.
2. Aparte `lastSyncFailed`-vlag die alleen bij een geslaagde sync wordt gewist; de banner in `Layout.tsx` stuurt daarop.
3. Pending-teller reactief maken met Dexie `useLiveQuery` in plaats van de 30 s-poll.
4. Auto-sync: laat de `online`-handler onvoorwaardelijk `syncNow()` aanroepen en doe de pending-guard *binnen* `syncNow()` met een verse `await getSyncProgress()`. **Let op re-entrancy** — `syncNow()` moet idempotent zijn bij overlappende aanroepen.
5. Toon per record een foutstatus bij `syncRetryMeta.status === "failed"` en een dead-letter-drempel.

**Acceptatie.** Offline muteren → online gaan → sync start binnen enkele seconden zonder handmatige actie. Een geforceerde push-fout laat de rode banner "Synchronisatie mislukt" + "Probeer opnieuw" staan tot een geslaagde sync. De pending-teller loopt direct mee met een mutatie.

**Tests.** Vitest met fake timers op `SyncContext` (mock `syncAll` → `{success:false,errors:[…]}`, timers doorspoelen, assert dat `syncState` `"error"` blijft). Playwright met echte `context.setOffline(true/false)`: muteer offline, ga binnen 5 s online, assert `/sync/push` in de netwerklog.

---

## WP-A2 · Dataverlies-stop: constateringen + meetstaten (PWA) — **S1**

**Bevindingen:** B-206 (S1), B-207 (S1), B-210 (S2), B-223d (S3)
**Afhankelijk van:** WP-A1

**Root cause — drie losse fouten die elkaar versterken.**
- **B-210 (bovenliggend):** `src/features/visual-inspection/VisualInspectionPage.tsx` houdt antwoorden in `useState`; regel ~489 is letterlijk `<button className="btn-secondary flex-1">Opslaan</button>` — **geen `onClick`**. Er wordt dus nooit een `VisualInspection`-record aangemaakt.
- **B-206:** `src/features/visual-inspection/CreateFindingSheet.tsx:172` zet `visualInspectionId: checklistItemId` en tien regels lager `checklistItemId: undefined` — de waarde staat in het verkeerde van twee bestaande velden. Push geeft een FK-violation (P2003); **nul findings bereiken ooit de server**.
- **B-207:** `src/services/db/measurement-sheets.ts` (`getOrCreateMeasurementSheetRecord` → `createMeasurementSheetRecord`) zet `templateVersion` nooit; `push.ts` stript `undefined` weg en Prisma eist de kolom → **nul meetstaten bereiken de server**.
- **B-223d:** dezelfde get-or-create is een find-then-create zonder lock → StrictMode maakt twee records.

**Aanpak.**
1. **B-210 eerst:** antwoorden per klik naar Dexie persisteren (debounce ~1 s, analoog aan de meetstaat-autosave); bij het eerste antwoord een `VisualInspection` aanmaken met `assetNodeId` + `inspectionPlanId` + `_pendingSync: true`; "Afronden" → `status = completed` + `completedAt`.
2. **B-206:** `visualInspectionId: undefined` + `checklistItemId,` — en koppel de finding aan de zojuist aangemaakte `VisualInspection`. Leg de push-volgorde vast: **visualInspections vóór findings**.
3. **B-207:** `templateVersion: templateSnapshot.version` meegeven; haal het veld uit de `Partial<…>` in `src/services/db/types.ts` zodat TypeScript het afdwingt.
4. **B-223d:** get-or-create idempotent maken op `(assetNodeId, inspectionPlanId, templateId)` binnen een Dexie-transactie + compound index.
5. **Dexie-repairhook (v15)** voor bestaande toestellen: verplaats een foute `visualInspectionId` naar `checklistItemId` en vul een ontbrekende `templateVersion` uit `templateSnapshot.version`. **Zonder deze hook blijft het dataverlies bestaan bij bestaande installaties, ook ná de fix.**
6. Client-side FK-integriteitscheck in `push.ts`: push geen record waarvan de FK lokaal niet bestaat en niet meegaat.

**Ook in dit pakket (Beheer-repo, aparte PR):** de **sync-contracttestsuite** uit `00-herstelplan.md` §5 — per entiteit een payload zoals de PWA hem serialiseert naar `/sync/push`, assert de DB-rij. Plus `findings.fkChecks` uitbreiden met `visualInspectionId` zodat een foute FK een nette NL-400 geeft in plaats van een rauwe Prisma-fout.

**Acceptatie.** Checklist invullen → wegnavigeren → antwoorden staan er nog. NOK → constatering → sync → de finding staat in de DB en `errors[]` is leeg. Meetstaat invullen → sync → record in de DB. Eén meetstaat-record per asset, ook onder StrictMode.

**Tests.** Vitest op alle vier de punten; Jest-e2e (Beheer) met een PWA-serializer-payload; Playwright-regressie op de volledige keten checklist → finding → sync.

---

## WP-A3 · Documentketen-integriteit (API) — **S1**

**Bevindingen:** B-101 (S1), B-102 (S1), B-103 (S2), B-104 (S2)

**Root cause.** `apps/api/src/modules/generated-documents/generated-documents.controller.ts` zet `const STAFF = ALL_STAFF` op vrijwel de hele lifecycle; alleen `finalize` heeft `APPROVERS`. Gevolg: één INSPECTEUR kan de complete keten alleen doorlopen — genereren, ondertekenen namens de klant, inhoud achteraf wijzigen, en het bewijs verwijderen.
- **B-101:** `signDocument()` schrijft `dto.signerRoleCode` ongefilterd weg. Geen lookup tegen `imp_signer_roles`, geen mapping gebruikersrol → signer-rol, geen koppeling aan een openstaand `REQUESTED`-verzoek. Opvallend: `requestSignature()` doet die lookup **wél** (`resolveLookup(LOOKUP_KIND.SIGNER_ROLES, …)`).
- **B-102:** `DELETE` is `ALL_STAFF` en `delete()` blokkeert alleen `FINALIZED`; `imp_document_signatures` cascadeert mee. Bovendien passeert die cascade de Prisma-audit-middleware niet, dus de verwijderde handtekeningen komen niet in de audittrail.
- **B-104 (deels gefixt):** `updateEditedContent()` blokkeert inmiddels `SIGNED` en `FINALIZED`, maar kijkt naar de **documentstatus** in plaats van naar het bestaan van een `SIGNED`-rij → bij `PENDING_SIGNATURES` is bewerken nog toegestaan.

**Aanpak.**
1. **Rolmatrix vastleggen** (B-103) — de PWA genereert documenten, dus "genereren mag ALL_STAFF" is waarschijnlijk correct; leg dat expliciet vast in de PRD/docs en werk de SEC-06-tekst in `docs/testprogramma/07-cross-tenant-security.md` bij. De risicoreductie zit in de andere drie.
2. **B-101:** kopieer de `resolveLookup`-check naar `signDocument()` (400 bij een onbekende rolcode). Voeg een rolgebonden mapping toe: INSPECTEUR → alleen `INSPECTOR`; `REVIEW_ROLES` → `REVIEWER`; `CLIENT`/`INSTALLATION_RESPONSIBLE` uitsluitend via `signViaRequest()`. Update de bestaande `PENDING`/`REQUESTED`-rij in plaats van te inserten (of `@@unique([generatedDocumentId, signerRoleCode])` + migratie). Vul `signedIpAddress` en de ondertekenende `userId`.
3. **B-102:** `@Roles(...STAFF)` → `@Roles(...APPROVERS)` op de DELETE-route (**één regel, snelste risicoreductie van het hele plan**). Plus: weiger verwijderen zodra er ≥1 `SIGNED`-handtekening is. Overweeg soft-delete (`isDeleted`) als vervolgstap.
4. **B-104:** vervang de statuscheck door een handtekeningcheck (`count SIGNED > 0 || FINALIZED` → 403). De portal-editor moet ná de eerste handtekening read-only worden.

**Let op — raakt de PWA.** `apps/inspectie-app/src/services/documentSyncService.ts:270` post `{ signerRole, signatureImage }`, terwijl de DTO `signerRoleCode` verwacht; met `forbidNonWhitelisted` geeft dat nu al een 400. De PWA-typedef staat bovendien `CLIENT`/`WITNESS` toe. Coördineer dit als één API+PWA-pakket.

**Acceptatie.** INSPECTEUR + `CLIENT` → 403. INSPECTEUR + `BESTAAT-NIET` → 400. INSPECTEUR + `INSPECTOR` → 201. INSPECTEUR `DELETE` → 403. APPROVER `DELETE` op een document met een SIGNED-handtekening → 400. `PATCH` na de eerste handtekening → 403.

**Tests.** Unit op `document-signing.service.spec.ts`; **e2e-rolmatrixtest** per route × rol (`generate-plan`, `generate-report`, `PATCH`, `DELETE`, `sign`, `finalize`) — dat is meteen het regressievangnet voor de hele module.

---

## WP-A4 · Klantportaal-crash na AssetNode-migratie (client-portal) — **S1**

**Bevindingen:** B-401 (S1) · **omvang: < 1 uur**

**Root cause.** De API levert `assetNode` (`{id, name, description}`), het klantportaal leest `finding.asset` → `undefined.locationDescription` → `TypeError` die de hele pagina overneemt. Het handgeschreven type in `apps/client-portal/src/types/findings.ts:31` declareert nog `asset: AssetRef`, dus de compiler ving niets. Let op: een naïeve rename volstaat niet — `locationDescription` bestaat niet op `assetNode`; het equivalent heet `description`.

**Inventarisatie is gedaan:** exact 4 regels crashen (`findings-tab.tsx:83,115` en `finding-detail-modal.tsx:133-136`). `types/inspections.ts` is correct (de service bouwt daar bewust een `assets`-array). In de staf-portal is `asset.*` géén restant maar een bewuste compat-facade in `assets.service.ts` — wel tech debt, geen bug.

**Aanpak.** `AssetRef` → `{ id, name, description: string | null }`, veld hernoemen naar `assetNode`; in beide componenten `finding.locationDescription ?? finding.assetNode?.description ?? null`. Voeg een ErrorBoundary **per tab** toe zodat één kapotte kaart nooit meer het hele detailscherm sloopt.

**Acceptatie.** De tab Constateringen laadt op elk plan met ≥1 constatering; KL-09 t/m KL-14 zijn weer uitvoerbaar.

**Tests.** Vitest-component-test op `FindingsTab` met een fixture die **exact de servershape** heeft — dat is de regressiebescherming die nu volledig ontbreekt.

---

# GOLF 2 — Ernstig (S2)

## WP-B1 · Referentiedata-sync herstellen (PWA)

**Bevindingen:** B-202 (S2), B-204 (S2), B-205 deel 1 (S2) · **Afhankelijk van:** A1

**Root cause.** `src/services/sync/reference.ts` valideert de responsevorm nergens en cachet stil niets:
- **B-202:** `if (response.success && response.data?.assetTypes)` — maar de controller retourneert `{success, data: <platte array>}` → `undefined` → `console.warn`, cache blijft leeg → "Asset toevoegen" heeft geen enkel type.
- **B-204:** checklists worden **helemaal niet** opgehaald. `cacheChecklists` heeft nul aanroepers, er is geen `checklistsApi`. De statische fallback is gesleuteld op `hoofdverdeler`/`zonnepanelen` terwijl de org `electrical_installation`/`pv_installation` gebruikt → nooit een match → visuele inspectie is voor élke asset onbereikbaar.
- **B-205a:** de **lijst**-respons wordt gecachet, maar die selecteert alleen `_count: {sections: true}` — de detail-route levert `sections` wél. Gevolg: meetstaat zonder invoervelden, en `validateRecord()` meldt misleidend "100% voltooid".

**Aanpak.**
1. Tolerante unwrapping: `Array.isArray(response.data) ? response.data : (response.data?.assetTypes ?? [])`. `console.warn` → `console.error` + zichtbare melding.
2. Nieuwe `checklistsApi` (`GET /checklists?status=ACTIEF` + detail voor items) + `fetchAndCacheChecklists()`, met mapping `itemLinks[].checklistItem → CachedChecklistItem` (`isRequired`/`sortOrder` uit de link, `categoryOverride` boven `checklistItem.category`). De Dexie-store `cachedChecklists` bestaat al → **geen migratie**.
3. Meetstaat-templates: òf per template de detailrespons cachen, òf **beter** de lijst-endpoint in de API uitbreiden met `sections` (dan is het een Beheer-fix, geen N+1).
4. Controleer of `cachedLocationTypes` dezelfde responsevorm-mismatch heeft (waarschijnlijk wel — blokkeert WP-B2).

**Verplicht in dit pakket:** de **referentie-contracttest** uit `00-herstelplan.md` §5 — per endpoint de echte responsevorm → assert dat de cache gevuld raakt. Die had B-202 én B-205 in één klap gevangen.

**Acceptatie.** "Asset toevoegen" toont types. Visuele inspectie toont checklistitems. Meetstaat toont ≥1 invoerveld.

---

## WP-B2 · Assetboom bereikbaar + dode UI (PWA)

**Bevindingen:** B-201 (S2), B-213 (S2), B-214 (S3), B-215 (S3), B-221 (S3), B-223c/f/g · **Afhankelijk van:** B1

**Root cause.**
- **B-201:** `getAssetsByPlanId()` filtert `nodeType === "ASSET"` en gooit alle LOCATION-nodes weg; `AssetTree.tsx:27` bepaalt daarna wortels met `!parentId`. In het unified model hangt elke ASSET onder een LOCATION → na het strippen heeft élke node een `parentId` die niet meer in de array zit → boom altijd leeg, en de empty-state slaat niet aan omdat `assets.length > 0`.
- **B-213:** `AddLocationSheet.tsx` en `LocationAssetTree.tsx` hebben **nul imports** buiten hun eigen bestand; het plan-kebabmenu (Bewerken/Archiveren/Annuleren) heeft geen handlers.
- **B-214:** sheet en bottom-nav delen stapelniveau 50; de nav staat later in de DOM en wint → de primaire CTA is niet klikbaar.
- **B-215:** min/max gaan als RHF-regels mee maar er wordt geen `errors.technicalData?.[key]` gerenderd, en `min`/`max` worden niet als DOM-attribuut gezet → stille dead-end.
- **B-221:** `getImageMetadata()` krijgt het originele `File` terwijl de gecomprimeerde blob wordt opgeslagen → metadata beschrijven het verkeerde bestand.

**Aanpak.** Wortels afleiden uit de set (`!parentId || !ids.has(parentId)`), of structureel `LocationAssetTree` inhangen — dat lost B-213 half op. FAB → keuzemenu Asset/Locatie. Handler-loze knoppen implementeren óf verwijderen/`disabled` zetten. Sheet + overlay naar `z-[60]` + `pb-[calc(4rem+env(safe-area-inset-bottom))]`. Foutregels onder dynamische velden + `min`/`max` als DOM-attribuut; overweeg de gedeelde `NumericInput` (mét clamping) te hergebruiken. Metadata uit de gecomprimeerde blob halen. Placeholder op de parent-select; sheet-titel corrigeren.

**Extra:** voeg een CI-check op ongebruikte componenten toe (`knip` of vergelijkbaar) — dat vangt dit soort dood werk structureel.

**Acceptatie.** Assets zijn klikbaar vanaf de plandetailpagina; locatie toevoegen werkt; elke sheet-CTA is aanklikbaar (`document.elementFromPoint` geeft de knop terug); een waarde buiten min/max toont een NL-foutmelding.

---

## WP-B3 · Superuser-scoping & onboarding (API + portal)

**Bevindingen:** B-502 (S2), B-503 (S2), B-504 (S2), B-511 §1 · **Beslissing D2: subdomein bepaalt de scope**

**Root cause.** `req.tenant.orgId` en `user.orgId` zijn twee ongekoppelde waarheden. `orgScope(user)` in `apps/api/src/common/utils/org-scope.ts` geeft voor een SUPERUSER `{}` (geen filter) en kent `req.tenant` niet; de `TenantGuard` doet voor een SUPERUSER `return true` zonder de context door te geven. Daaruit volgen alle drie:
- **B-502:** platform-brede data op elk org-subdomein.
- **B-503:** `ContactsService.create()` laat een SUPERUSER door met `orgId = null` en schrijft `orgId: orgId!` → `PrismaClientValidationError` → **500** (de filter mapt alleen `P2002/P2025/P2003`).
- **B-504:** `users.controller.ts:166` geeft `user.orgId` door aan `invite()`; voor een SUPERUSER is dat `null` → 400 "Organisatie is vereist". `InviteUserDto` heeft geen `orgId`-veld en `forbidNonWhitelisted` blokkeert het meesturen. **Een via de UI aangemaakte org is alleen met een DB-ingreep in gebruik te nemen.**

**Aanpak.**
1. Introduceer `orgScopeFor(user, tenant)`: SUPERUSER + `tenant.orgId !== null` → `{ orgId: tenant.orgId }`; SUPERUSER op het superuserdomein → `{}`; overig → `{ orgId: user.orgId! }`. Houd `orgScope(user)` als deprecated wrapper en migreer de **40 callsites** in batches per module. Idem voor de 28 `requireOrg(...)`-plekken.
2. Vervang overal `orgId!` door `requireOrg(user, tenant)`. Grep: `orgId!` en `orgId: user.orgId`.
3. Filter: voeg een tak `PrismaClientValidationError` → 400 "Ongeldige gegevens" toe en `P2011` (null constraint) → 400. Log die tak wel op `error`-niveau mét requestId, anders verdwijnen echte bugs uit het zicht.
4. Onboarding: `POST /organizations/:id/invite` (SUPERUSER-only), naast de bestaande `GET /organizations/:id/users`. Plus een knop "Eerste beheerder uitnodigen" in de lege staat van de gebruikers-tab op de org-detailpagina. De bestaande rolhiërarchie-check in `invite()` blijft ongewijzigd.
5. B-511 §1: toggle voor `isActive` op de org-detailpagina met `useConfirm` en een waarschuwing dat het subdomein daarna 404 geeft.

**Waarschuwing.** Dit **beperkt** wat een superuser vandaag op een org-subdomein ziet. Controleer of er superuser-pagina's zijn die daar platform-brede data verwachten (error-reports, help-admin, support-toegang) en pas die aan of verplaats ze naar `mijn.*`.

**Acceptatie.** Superuser + `Host: nieuweklant.localhost` → `GET /users` toont alleen die org; `Host: mijn.localhost` → alle. `POST /contacts` op een org-subdomein → 201 met de juiste orgId, nooit 500. Volledige keten org aanmaken → plan toewijzen → beheerder uitnodigen → accepteren → inloggen werkt via de UI.

**Tests.** Uitbreiden van de bestaande `org-scope.spec.ts` met de tenant-matrix (4 gevallen); e2e op de onboardingketen (SU-01 → SU-11); regressiecheck dat een ORG_ADMIN niets merkt.

---

## WP-B4 · Upload-security: logo + avatar (API)

**Bevindingen:** B-507 (S2) · **Beslissing D3: SVG schrappen + headers harden**

**Root cause — drie gaten in dezelfde keten.**
1. De whitelist checkt `file.mimetype`, dat is de **door de client meegestuurde** Content-Type. Geen magic-byte-check; `file-type` zit niet in `package.json`.
2. De opgeslagen extensie komt uit `sanitizeStorageExtension(file.originalname)` — de **bestandsnaam** — en `downloadLogo()` leidt het Content-Type af uit díe extensie. Dus `-F 'file=@payload.svg;type=image/png'` passeert als PNG, wordt opgeslagen als `.svg` en teruggeserveerd als `image/svg+xml`. **Alleen `file.mimetype` dichttimmeren is niet voldoende.**
3. De download-route is `@Public()` en zet geen `X-Content-Type-Options`, geen `Content-Disposition`, geen CSP; `main.ts` heeft **geen helmet** en geen globale CSP.

Escalatie: de portal draait op hetzelfde origin, de refresh-cookie is httpOnly maar origin-gebonden, niet poort-gebonden → uitgevoerde JS kan `/auth/refresh` aanroepen en met een vers access-token API-calls doen namens het slachtoffer.

**Aanpak.**
1. `image/svg+xml` uit de whitelist. **Datacheck vooraf** (zie `00-herstelplan.md` §8) en converteer bestaande SVG-logo's naar PNG.
2. Valideer de **inhoud** met magic bytes; verwerp mismatch met een NL-400; genereer de extensie uit het **gedetecteerde** type (niet uit `originalname`); sla het gedetecteerde mimetype op en serveer dát.
3. Download-route: `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Content-Disposition: inline; filename="logo.png"` (browsers negeren dat bij `<img src>`, dus veilig én gratis). Voeg `helmet()` toe in `main.ts` als platformbreed vangnet.
4. **Pas dezelfde behandeling toe op `POST /users/me/avatar`** — die heeft vermoedelijk hetzelfde probleem.
5. Let op `Cache-Control: public, max-age=86400`: een kwaadaardig logo blijft tot 24 uur in caches hangen. Zet bij verwijderen de cache-key om.

**Acceptatie.** Een buffer die met `%PDF` begint maar `image/png` claimt → 400. `file=@evil.svg;type=image/png` → geen `.svg`-extensie in de storage key. `GET /organizations/:id/logo` bevat `nosniff` + CSP en serveert nooit `image/svg+xml`.

---

## WP-B5 · Offerte-keten: gate, bedragen, idempotentie (API + portal)

**Bevindingen:** B-304, B-307, B-308, B-303, B-309 (alle S2), B-302, B-314, B-315 groep B (S3)

**Root cause per onderdeel.**
- **B-304 (dead-end):** `quote-detail-page.tsx:169-173` berekent `approvalRequired` al correct, maar de actiemenu-condities op regel 265/273 gebruiken `quote.requiresApproval`. **Tweeregelige swap.** De backend (`isQuoteApprovalRequired()`) is correct.
- **B-307 (geen vier-ogen):** `assertIsApprover()` checkt uitsluitend de **rol**, nooit `pending.requestedBy === user.id`. Dezelfde service weigert dat bij *vrijwillige* verzoeken wél — het principe is bekend, alleen niet toegepast op de verplichte drempelgate.
- **B-308 (dubbele mail):** `sendQuote()` heeft geen `sentAt`-check en geen transactie; twee gelijktijdige requests lezen beide `CONCEPT`. De client-disable is render-race-gevoelig (twee klikken binnen ~15 ms vallen in dezelfde batch).
- **B-303 (500):** geen bovengrens op `quantity`/`unitPrice`, kolommen zijn `numeric(12,2)`, en de exception-filter mapt alleen `P2002/P2025/P2003` → Postgres' `numeric field overflow` valt door naar 500.
- **B-309 (staffels):** de editor stuurt geen `quantity` naar `resolve-price`; de controller doet `parseFloat(undefined) || 1` → altijd tier 1. En een aantalwijziging triggert geen herberekening.
- **B-302:** `unitPrice` heeft geen `@Min`, `vatRate` geen `@Min/@Max`, `discountPct` geen `@Max`.
- **B-314:** `RejectQuoteDto.note` is verplicht (`@IsString()` zonder `@IsOptional`) terwijl de UI "(optioneel)" zegt → rauwe Engelse melding "note must be a string".

**Aanpak.**
1. B-304: `quote.requiresApproval` → `approvalRequired` op beide regels. Robuuster: laat de API `approvalRequired` meeserialiseren zodat er één bron van waarheid is. **Fix B-304 en B-307 samen** — zodra de knop werkt is zelf-goedkeuren makkelijker bereikbaar.
2. B-307: self-approval-check in `assertIsApprover()` (dekt `approve()` én `reject()`). **Breaking voor orgs met één MANAGER** → voeg `Organization.quoteApprovalSelfApprovalAllowed @default(false)` toe (migratie) met een duidelijke fallbackmelding. SUPERUSER-bypass blijft.
3. B-308: race-vrij via een conditionele update in een transactie — `updateMany({ where: { id, sentAt: null }, data: {…} })` en alleen mailen bij `count === 1`. Client: `useRef`-guard die synchroon zet vóór de `await`. **Controleer hetzelfde patroon op elk mail-versturend endpoint** (`send-confirmation`, `request-signature`). Overleg met de business of "opnieuw versturen" gewenst is → dan een expliciete `POST /quotes/:id/resend`.
4. B-303: `@Max` op `quantity`/`unitPrice`; valideer het berekende totaal vóór de write; **en voeg `P2020` + een `numeric field overflow`-tak toe aan de filter** — dat beschermt in één klap ook work-orders, price-tables, projecten en producten.
5. B-309: `quantity` expliciet meesturen; debounced herberekening bij aantalwijziging **met een `priceOverridden`-vlag** zodat handmatige prijzen niet worden teruggezet; toon de herkomst ("staffel 10–49: € 10,00").
6. B-302: `@Min/@Max` op de resterende velden + zod-resolver met NL-meldingen. **Let op: seed-fixture `TP-OFF-010` bevat bewust ongeldige waarden** — pas de seed in dezelfde PR aan.
7. B-314: label naar "Reden voor afwijzing", knop disabled bij leeg, frontend-type naar `note: string`.
8. B-315 groep B: guard op een offerte met 0 regels; `PlanningService.createFromQuote()` doet nu `logger.warn` + `return` zonder gebruikersfeedback als er geen locatie is — er verdwijnt werk uit de pipeline zonder spoor.

**Acceptatie.** Offerte > drempel is via de UI ter goedkeuring in te dienen; de aanvrager kan hem niet zelf goedkeuren; dubbelklik op Versturen levert exact één mail; `quantity 999999999` geeft 400 met NL-melding; staffelprijzen kloppen op de grenzen 9→10 en 49→50.

**Tests.** Parallelle `Promise.all`-test op `send` (1× 201, 1× 400, e-mailmock exact één keer). Tier-grenstests. DTO-grenstests. Portal-test op het actiemenu.

---

## WP-B6 · Paginatie-contract + zichtbare queryfouten (API + portal)

**Bevindingen:** B-305 (S2) · **grootste bang-for-buck van het hele plan**

**Root cause.** 25 voorkomens van `limit: 200` in `apps/portal/src` over 18 bestanden; **15 call-sites in 11 bestanden** raken een endpoint met `@Max(100)` → HTTP 400, query faalt **stil**: TanStack Query slikt de fout, de dropdown rendert leeg zonder foutstate. Van de 28 DTO's die de basis uitbreiden hebben er zes een eigen cap (50/100/200/500/1000) — zeven verschillende maxima zonder beleid.

Bekend kapot, o.a.: "Nieuwe inspectie"-modal (`useContacts`), contactpersoon-modal, taak-modal, upload-document-modal (5 dropdowns), offertesjabloon-switcher, finding-templates in de meetstaat-builder, asset-modal — **plus twee nieuw gevonden**: de volledige `assets-page.tsx` en de contactpersoon-dropdown in `project-phases-tab.tsx`.

**Aanpak.**
1. `@Max(100)` → `@Max(200)` in `apps/api/src/common/dto/pagination-query.dto.ts` (**één regel, lost alle 15 op**), verwijder de redundante `@Max(100)`-overrides (customer-groups, document-tags) en documenteer 200 als basis.
2. **Verplicht, ongeacht route 1:** laat een gefaalde dropdown-query een zichtbare foutstate tonen (centraal in de gedeelde query-wrapper). Dit is de eigenlijke systemische fix — anders is elke toekomstige mismatch opnieuw onzichtbaar.
3. Meet de p95 op `/contacts`, `/quotes` en `/assets` vóór uitrol; `/assets` is het grootste risico (productie kan duizenden records hebben). Plan server-side search in dropdowns als vervolgstap voor die twee.

**Acceptatie.** Alle 15 schermen tonen data. Een parametrische test itereert over **alle** gepagineerde endpoints met `?limit=200` en verwacht 200 — dat is de enige regressiebescherming die niet achterloopt.

---

## WP-B7 · Publieke endpoints: allowlist + tenantbinding (API)

**Bevindingen:** B-306 (S2), B-152 (S2)

**Root cause.**
- **B-306:** `planning-public.service.findByPublicToken()` sluit af met `return { ...item, … }` — de spread neemt élk kolomveld mee, inclusief `internalNotes`. Ironisch genoeg strippen de genestte relaties (`toPublicInspectorUser()`) wél zorgvuldig telefoon/e-mail; alleen het item zelf niet. De publieke pagina rendert die notities onder "Opmerkingen".
- **B-152:** `quote-public.service` doet `findUnique({ where: { publicToken } })` zonder `orgId`-filter en zonder vergelijking met `req.tenant`; de controller injecteert geen `@CurrentTenant()`. Lezen én **ondertekenen** lukt vanaf elk subdomein. Bovendien staat `@RequiresFeature('CRM_COMPLEET')` op klasseniveau → geëvalueerd tegen de bezoekende tenant in plaats van tegen `quote.orgId`.

**Aanpak.**
1. Vervang de root-`include` door een expliciete `select`-allowlist; verwijder de spread. Inventariseer eerst wat de publieke pagina allemaal uit `data` leest. Wil je klantgerichte toelichting: nieuw veld `clientNotes` + migratie.
2. `@CurrentTenant()` in alle vijf publieke quote-handlers; `findUnique` → `findFirst({ where: { publicToken, orgId } })`. Beslis expliciet wat er op `mijn.*` gebeurt (aanbeveling: weigeren). Verplaats de feature-gate naar de service, geëvalueerd tegen `quote.orgId`.
3. **Controleer eerst hoe `PUBLIC_URL` de offerte-URL opbouwt** — bestaande links die op een generiek domein zijn verstuurd breken anders.

**Privacy-actie:** bestaande interne notities staan al publiek achter tokens die mogelijk gedeeld zijn → overweeg tokenrotatie na de fix.

**Acceptatie.** `GET /public/planning/:token` bevat geen `internalNotes`. Een geldige `publicToken` van org A op het subdomein van org B geeft 404 voor lezen, PDF én ondertekenen.

**Tests.** **Key-snapshot-test op de volledige publieke payload** zodat élk nieuw veld bewust moet worden toegelaten — dat is de generieke bescherming tegen dit type lek.

---

## WP-B8 · Planning: sessies toewijzen (portal)

**Bevindingen:** B-310 (S2)

**Root cause.** `planning-sessions-tab.tsx` biedt datum, verzetten en annuleren, en toont "Bevestigen" alleen bij `status === CONCEPT`. Maar `grep "assign"` op dat bestand geeft **nul treffers**: de portal roept `POST /planning/:id/sessions/:sessionId/assign` nergens aan. De sessie komt dus nooit op CONCEPT → "Bevestigen" verschijnt nooit. Gesloten cirkel. De backend is compleet.

**Aanpak.** Voeg per sessie een "Inspecteurs toewijzen"-actie toe die de **bestaande** toewijzingsmodal van de planregel hergebruikt — inclusief de beschikbaarheidscheck en de 409+`warnings`-override-dialoog, die volgens BO-34 t/m BO-37 correct werkt. Overweeg "Bevestigen" ook bij `NOG_TE_PLANNEN` te tonen met een disabled-tooltip die uitlegt wat er ontbreekt, zodat de dead-end structureel weg is.

**Acceptatie.** Het volledige BO-40-pad (meerdaags → sessie → inspecteur → bevestigen → DEFINITIEF) is via de UI af te ronden.

---

## WP-B9 · Klantportaal: zichtbaarheid + mitigaties (API + portals)

**Bevindingen:** B-412 (S3), B-402 (S2, **mitigatie**), B-403 (S2, **mitigatie**), B-406 deel 1 (S3) · **Afhankelijk van:** A4 · **Beslissing D1**

**Root cause.**
- **B-412:** de review-gate is als *transitie*-gate gebouwd, terwijl het klantportaal onafhankelijk draait op "alles van mijn contact" — `client-inspections.service.list()` filtert nergens op `statusCode`. De klant ziet plannen in `pending_review` inclusief volledige constateringen.
- **B-402/B-403:** het datamodel is compleet en voorziet expliciet in tweerichtingsverkeer (`InspectionMessage.userId`, `ClientRequest.handledBy/handledAt/responseNotes`), de klantroute werkt, en **de organisatie kan er niet bij**. Bij B-403 staat het bewuste uitstel letterlijk in de code (`client-requests.service.ts:6-7`, FASE6 §8). De klant krijgt intussen een valse bevestiging.
- **B-406a:** de autorisatie is correct (`canSign` op planniveau → 403), maar de API geeft die vlag niet mee, dus de UI dringt aan op ondertekenen dat de klant niet mág.

**Aanpak (mitigatie, niet de feature).**
1. **B-412:** metadata (titel, adres, datum, status) blijft altijd zichtbaar — de klant wil weten wanneer de inspecteur komt — maar **constateringen en documenten pas vanaf `reviewed`/`approved`**. Filter in de service (lijst + detail + findings + documents), niet in de UI, en laat het doorwerken in de dashboardtellers. Let op de wisselwerking met `Organization.inspectionReviewEnabled` (default `true`): bij orgs die review uitzetten mag er niets verdwijnen.
2. **B-402 mitigatie (~1 uur):** verberg de Berichten-tab óf haal de belofte "de organisatie leest mee" uit de bevestigingstekst. Nu krijgt de klant een aantoonbaar valse bevestiging.
3. **B-403 mitigatie (~2 uur):** stuur bij een nieuw klantverzoek een e-mail naar de organisatie. Dat dicht het commerciële lek terwijl de echte feature wordt ingepland.
4. **B-406a (~3-4 uur):** geef `canSign` per document mee in `client-documents.getDetail`; verberg knop en dashboard-item als die false is, met uitleg ("ondertekening verloopt via de link in uw e-mail").

**De volledige features staan als epics in `03-beslispunten-backlog.md`.**

---

## WP-B10 · Constatering-classificatie uit het model (PWA + API)

**Bevindingen:** B-222 (S2) · **Afhankelijk van:** B1

**Root cause.** `CreateFindingSheet.tsx` zet `setClassificationValues({ risico: "gering" })` als default en biedt een **hardgecodeerde** lijst. De model-gedreven tak wordt alleen bereikt via een finding-template met `classificationModelId`; de org heeft er nul → élke constatering valt in de vaste tak. Serverzijde mapt `computeFindingCriticalField()` op `ClassificationOption.isCritical`; `{"risico":"kritiek"}` matcht niets → `isCritical` blijft `false` en de hele PRD-14-keten (online herstel, herinspectie-voorstel) armt nooit.

**Aanpak.** PWA: val terug op het **standaardclassificatiemodel van het normtype van het plan** in plaats van de vaste lijst; is er echt geen model → opslaan blokkeren met een NL-melding in plaats van fictief vocabulaire wegschrijven. API: valideer server-side dat `classificationValues` alleen bestaande kenmerk-/optiecodes bevat (`classificationValuesSchema` accepteert nu elke JSON).

**Coördinatie.** De serverzijdige validatie mag **pas scherp** wanneer alle clients de juiste codes sturen — anders breken bestaande pending records. Neem een Dexie-repair of expliciete afkeuring mee voor lokale records met `{"risico": …}`.

**Acceptatie.** Een "Kritiek"-constatering uit de PWA levert `isCritical = true` op de server en armt de herinspectie-trigger. Er bestaat al deels dekking (`sync.finding-critical.spec.ts`) om op voort te bouwen.

---

# GOLF 3 — Matig/cosmetisch (S3/S4)

## WP-C1 · Foutcontract: NL-meldingen + 404-oracle (API + portal)

**Bevindingen:** B-105, B-106, B-151, B-155, B-501, B-509, B-601

**Root cause.** Eén ontbrekend afgedwongen foutcontract:
- Twee patronen naast elkaar: correct is `findFirst({ id, ...orgScope })` + `assertFound()` → 404; lekkend is `findUnique({ id })` + losse org-vergelijking met een **kale** `new ForbiddenException()` → 403 + Engelse "Forbidden". Geverifieerd: **39 kale aanroepen** in `apps/api/src` (contacts, locations, quotes, users, products, price-tables, requests, customer-groups, e-mail-/quote-templates, document-tags).
- `RolesGuard` doet `return false` → Nest maakt er "Forbidden resource" van; `JwtAuthGuard` overschrijft `handleRequest()` niet → "Unauthorized"; `ParseUUIDPipe` heeft geen `exceptionFactory`; de globale `ValidationPipe` heeft er ook geen → class-validator's Engelse defaults gaan één-op-één door.
- `AppThrottlerGuard` laat de standaard `ThrottlerException` vallen ("Too Many Requests"), terwijl de enumeratieguard in de middleware wél NL geeft — twee foutpaden, twee talen, én twee body-shapes.
- Portal: platformroutes staan als kale `<Route>` zonder rol-gate (de comment beweert het tegendeel); een MANAGER krijgt een leeg *bewerkbaar* instellingenformulier na een 403.

**Aanpak.**
1. **Centrale NL `exceptionFactory`** op de globale `ValidationPipe` die constraint-keys (`min`, `max`, `isEmail`, `minLength`, `maxLength`, `arrayMinSize`, `isEnum`, `isNumber`) naar NL mapt — dekt B-501 én de hele B-155-familie zonder ~200 decorators aan te raken.
2. `RolesGuard`: `return false` → `throw new ForbiddenException('U heeft niet de juiste rol voor deze actie')` (**één regel**). `JwtAuthGuard.handleRequest()` overschrijven. Gedeelde `ParseUuid()`-helper met NL-melding. `AppThrottlerGuard.throwThrottlingException()` overschrijven + body-shape van de middleware-429 gelijktrekken (`success: false`).
3. Message-map in `AllExceptionsFilter` als vangnet voor bekende framework-teksten.
4. **De 39 plekken migreren** naar `findFirst + orgScopeFor + assertFound` → lost B-105 en het grootste deel van B-106 tegelijk op. **Uitzondering:** `assert-same-org.ts` (FK-injectie) moet 403 met NL-melding blijven geven — ander scenario, gedraagt zich correct.
5. B-151: `ForbiddenException('Geen toegang tot deze inspectie')` → `NotFoundException` (**één regel**); `assertSignAccess()` bewust op 403 laten.
6. Portal: `RoleRoute` naar analogie van de bestaande `FeatureRoute`; laat de settings-pagina bij een load-error een errorstate renderen in plaats van een leeg formulier. Zod-errorMap globaal via `z.setErrorMap()`. **Afbakening:** `GET /classification-models` en `/norm-types` geven bewust 200 voor ORG_ADMIN — die detailpagina's mogen niet per ongeluk SUPERUSER-only worden.

**Breaking.** 403 → 404 op `/:id`-routes raakt de foutafhandeling in portal en client-portal. Grep bestaande specs op Engelse teksten (`must not be less than`, `Forbidden resource`).

**Acceptatie.** Geen enkel 401/403/429-antwoord bevat nog Engelse framework-tekst. Cross-tenant `/:id` geeft 404 met een body die identiek is aan die van een niet-bestaande UUID (byte-vergelijking).

**Tests.** Tabelgedreven e2e die per module het paar (vreemde-org-id, onbestaande UUID) ophaalt en faalt zodra status of message verschilt.

---

## WP-C2 · Klantportaal-hygiëne (API + client-portal)

**Bevindingen:** B-404, B-405, B-407, B-408, B-409, B-410, B-411 · **samen < 1 dag, hoogste rendement per uur**

**Root cause.** De nieuwere modules (`client-repair`, PRD-14) zijn correct gehard; de oudere klantportaal-modules en de later toegevoegde publieke sign-route zijn overgeslagen.
- **B-404:** `client-documents/dto.ts` heeft alleen `@IsString() @IsNotEmpty()` op `signatureImage`, terwijl `client-repair` en `generated-documents` `@IsSafeDataImage()` gebruiken. Eén regel.
- **B-405:** `validateMagicLink` doet `findUnique` → check → veel later pas de update; de transactie beschermt het schrijven, niet de check. **Hetzelfde patroon op drie plekken**, waarvan `resetPassword()` het zwaarst weegt.
- **B-407:** `ResolveFindingDto.description` en beide `ClientRequest`-DTO's missen lengtegrenzen; `description` is een `Text`-kolom, dus er is geen DB-vangnet.
- **B-408:** de publieke sign-handler heeft geen `@Req()`, dus `signedIpAddress` blijft leeg — terwijl juist dat kanaal de zwakste identiteitsvaststelling heeft. De client- en repair-varianten leggen het IP wél vast.
- **B-410:** `getMainClassification()` geeft hardgecodeerd `isCritical: false` terug bij een ontbrekend model, terwijl `Finding.isCritical` het antwoord al bevat. De fixture `RAP-TEST-100` heeft geen `inspectionTemplateId` en test daardoor structureel het fallback-pad.
- **B-411:** `/register` zit achter een "al ingelogd? → dashboard"-guard die geen rekening houdt met "ingelogd als iemand anders"; de bestaande sessie wordt nergens beëindigd.

**Aanpak.** `@IsSafeDataImage()` toevoegen (+ een gedeelde sign-DTO-basisklasse of een test die alle sign-routes dezelfde validator afdwingt). Magic links consumeren met `updateMany({ where: { id, usedAt: null, expiresAt: { gt: now } } })` en beslissen op `count === 0` — drie keer, het beste als private helper; **let op dat `register()` de link bewust openhoudt tussen validatie en registratie**. Lengtegrenzen conform de `client-repair`-tegenhanger. `@Req()` + `signedIpAddress` (let op `trust proxy`). `isCritical` niet hardcoden maar `null` teruggeven zodat de caller op `Finding.isCritical` terugvalt — **check de andere callers, `generated-documents` deelt deze functie**. Bij `requiresRegistration: true` de bestaande sessie beëindigen of expliciet vragen.

**B-409 (anonimisering hersteller) vraagt eerst een beslissing** — zie `03-beslispunten-backlog.md`. Voer alleen route (b) uit (verklaring leidend, dus ook bij de constatering tonen dát er een ondertekende verklaring is) als de eigenaar dat bevestigt.

---

## WP-C3 · Sync-hardening serverzijde (API)

**Bevindingen:** B-203, B-212, B-216, B-217, B-218, B-223a

**Root cause.** De whitelist-mutator in `sync.service.ts` schrijft alles door wat in `allowed` staat, zonder domeinvalidatie of rolcheck, en lekt de rauwe Prisma-fout.
- **B-212:** vijf plekken doen `error: e?.message` — Prisma's message bevat in dev het absolute serverpad, broncoderegels en de volledige payload inclusief `orgId`/`createdBy`. Die tekst belandt bovendien in `syncRetryMeta.lastError` op het toestel.
- **B-203:** `typeCode` is een vrije string zonder lookup → lege waarde levert nodenummer `-0033`; en server-toegekende velden reizen niet terug in de push-respons.
- **B-216:** `MAX_ASSET_DEPTH` (10) heeft **nul consumenten** — noch in de PWA, noch in de API.
- **B-217:** `reviewerId` staat in de sync-whitelist; de userFkChecks controleren alleen bestaan + same-org, niet of de pusher de toewijzing mag doen.
- **B-218:** de sync gebruikt de generieke mutator, dus de statusovergang naar `pending_review` mist alle side-effects van `submit()` — inclusief de notificatie `INSPECTIEPLAN_TER_REVIEW` en vermoedelijk de AI-voorcontrole.
- **B-223a:** de pull filtert niet op `assignedTo`, dus de inspecteur ziet alle org-plannen als "Toegewezen".

**Aanpak.** Foutmapper Prisma-code → NL (P2003, P2002, …), volledige exceptie server-side loggen met correlatie-id, `errorFormat: 'minimal'` buiten lokaal. `typeCode` valideren tegen `imp_asset_type_definitions`; numbering weigeren bij een lege shortcode; `OpResult` uitbreiden met een additief `assigned?`-veld (**contractafspraak, geen bump nodig — wel vastleggen**). Dieptegrens afdwingen in beide schrijfpaden, alleen op nieuwe writes/moves zodat bestaande diepe bomen bewerkbaar blijven. `reviewerId`/`assignedTo` uit de whitelist halen (**check eerst of de PWA ze meestuurt** — dit is een contractversmalling) of anders rol-guarden. Statusovergang naar `pending_review` delegeren aan `InspectionPlansService.submit()`, met fallback-ontvangerbepaling.

**B-223a vraagt een beslissing:** ziet de inspecteur bewust alle org-plannen of alleen de eigen? Zie `03-beslispunten-backlog.md`.

---

## WP-C4 · Documentgeneratie + tabeloverflow (API + portal)

**Bevindingen:** B-311, B-312, B-301

**Root cause.**
- **B-311:** `formatHeaderFooter()` vervangt exact vijf Puppeteer-tokens; elke datalaag-placeholder passeert onvertaald → `{{organization.name}}` staat letterlijk in de kop van **elk** gegenereerd PDF-document.
- **B-312:** nul treffers op `table-layout|word-break|overflow-wrap` in de documentgeneratie, en de font-stack bevat geen CJK-font → lange namen lopen uit de pagina en Chinese tekens verdwijnen stil (Chromium laat glyphs zonder font weg). Word heeft het niet omdat Word zelf fallback doet.
- **B-301:** `table.tsx` zet `whitespace-nowrap` op elke `<td>` zonder `max-width`/`truncate` → een 220-teken string rekt de kolom tot 1812 px en duwt de rest uit beeld.

**Aanpak.** Header/footer door dezelfde variabelenresolver als de body halen, plus een vangnet dat resterende `{{…}}` verwijdert met een `logger.warn`. `table-layout: fixed` + `word-break` in de blokrenderer; `fonts-noto-cjk` in de Chromium-image (**infra-wijziging — hoort in dezelfde release als de deploy**) en `'Noto Sans CJK SC'` toevoegen aan alle font-stacks. `max-w-xs truncate` + `title=` in `table.tsx`, met `max-w-none` als escape via de bestaande `column.className`.

**Waarschuwing.** `table-layout: fixed` verandert de kolombreedteberekening van **alle bestaande documenttemplates**, en `truncate` raakt **elke portal-tabel**. Genereer vóór en ná een representatieve set en vergelijk visueel. De font-test is alleen zinvol in de echte container-image, niet lokaal op macOS — dat is waarschijnlijk precies waarom dit nooit is opgevallen.

---

## WP-C5 · Config-validatie & losse rest (API + portal)

**Bevindingen:** B-001, B-107, B-153, B-154, B-313, B-315-rest, B-505, B-506, B-508, B-510, B-511

| Bevinding | Kern | Aanpak |
|---|---|---|
| **B-508** | Zod `z.union([z.coerce.number().min(0), z.literal('')])` → `Number('')` = 0 wint altijd; de `=== ''`-check is **dode code**. Plus: vijf `<form>`-elementen sturen alle 21 org-velden. | `z.preprocess` die `''` → `null` mapt; per-tab-PATCH via `dirtyFields`. **Datacheck op `quote_approval_threshold = 0` — enige bevinding met mogelijke productie-datacorruptie.** Audit hetzelfde union-antipattern elders. |
| **B-510** | `update()` doet `data: dto`; de entitlement-gate leeft alleen in React. `assertFeature` bestaat al en `EntitlementsService` is al geïnjecteerd. | `assertFeature` op de `true`-transitie van `aiReviewEnabled`/`onlineRepairDefault`; uitzetten mag altijd (downgrade). Overweeg auto-uitzetten bij planwijziging. |
| **B-505** | `slug` heeft geen min/max en geen reserved-list; `classifyHostname()` matcht `SUPERUSER_SUBDOMAIN` vóór de lookup → een org met slug `mijn` is onbereikbaar. | `@MinLength(2)`/`@MaxLength(63)` + `RESERVED_SLUGS` die de **geconfigureerde** superuser-subdomein runtime meeneemt. Datacheck op bestaande slugs. |
| **B-506** | `minValue`/`maxValue` zijn losse velden zonder cross-field-validator; `publish()` checkt alleen secties/velden. | Cross-field-validator + **publish-gate** (vangt ook bestaande foute templates). **Let op: fixture `MS-SU17-TEST` is bewust fout en blijft na de gate onpubliceerbaar** — pas de seed aan. |
| **B-313** | `update()` valideert `inspectionTemplateId` wél maar mapt het niet naar `data` → 200 OK, geen effect. | Mapping toevoegen; overweeg alleen toe te staan bij `status === 'draft'`. **Fix de seed mee** (alle TP-plannen hebben dit). Generieke test DTO-velden ↔ servicemapping is het echte vangnet. |
| **B-107** | Scope-validatie staat ná de `create()`, en de reeks zit niet in een `$transaction` → afgewezen create laat een weesplan achter. | Validatie naar het `Promise.all`-blok vóór de write; `create` + `ensureRootNode` + `replaceScopeLocations` in één transactie. Let op de P2002-hergeneratie van nummers binnen een transactie. |
| **B-154** | `LocalStorageProvider.download()` doet een kale `fs.readFile` → ENOENT wordt een Engelse 500 op een publieke klantroute. | Getypeerde `StorageObjectNotFoundError` + centrale 404-mapping (dekt alle download-routes in één keer). Log als `warn` mét storage-key. |
| **B-153** | `refresh` doet `return { success:false }` in plaats van `throw` → HTTP 200. | Eén regel: `throw new UnauthorizedException('Geen refresh token')`. Controleer dat de PWA-interceptor daarop niet in een refresh-lus komt. |
| **B-001** | Dashboard-KPI's zijn module-level constanten met `value: '--'`. | Afleiden uit de al opgehaalde `useTasks`; `GET /dashboard/stats` voor de rest, mét feature-gating. Spinner bij loading. |
| **B-511** | Bundel: org deactiveren zonder UI; enumeratieguard telt inactieve orgs mee en blokkeert branding van álle orgs per IP; "Account gedeactiveerd" vóór de wachtwoordcontrole (timing-oracle); `logoUrl` draagt twee betekenissen (externe URL én storage key). | Losse fixes. **`logoUrl` is groter dan S4 suggereert** — `@IsUrl()` breekt de uploadflow; overweeg een aparte `logoStorageKey`-kolom. §2 (slug muteerbaar) en §8 (e-mail globaal uniek) zijn beslispunten. |
| **B-315-rest** | Reden ontbreekt bij VERLOREN/afkeuren; `reviewerId` blijft NULL na goedkeuren; publieke link zichtbaar op CONCEPT; INSPECTEUR ziet CRM-items in quick-create. | Reden-lookups verplichten, `reviewedById` wegschrijven, link verbergen bij `sentAt === null`, quick-create rol-filteren. |

---

# GOLF 4 — Gecoördineerd contractwerk

> Pas starten als golf 1–2 gestabiliseerd is. Deze drie raken het sync-contract of vragen een datamigratie; ze zijn bewust laat zodat je niet twee lagen tegelijk debugt.

## WP-D1 · Sync-versieanker + conflicten in de pull (PWA + API)

**Bevindingen:** B-209 (S2, grenst aan S1), B-223e

**Root cause.** `sync.service.ts` doet `if (clientSynced && existing.updatedAt > clientSynced)` — ontbreekt `syncedAt`, dan valt de hele conflicttak weg en volgt een onvoorwaardelijke update. "Geen basis bekend" wordt behandeld als "geen conflict". `syncedAt` wordt alléén in het sync-pad gezet, dus seeds en portal-writes laten het permanent NULL: **49 van 52 assetnodes**. Back-officecorrecties verdwijnen daardoor zonder spoor of melding. Daarnaast leven conflicten alleen client-side: `imp_sync_queue`-rijen met status `conflict` reizen niet mee in de pull, dus een openstaand conflict is onzichtbaar in een nieuwe sessie.

**Beslissing nodig:** `updatedAt` als universeel versie-anker (voorkeur — elk record heeft het altijd) of fail-closed op een ontbrekende `syncedAt`. De eerste is een echte contractwijziging (bump + Dexie-veld + migratie); de tweede geeft een tijdelijke conflictgolf op alle 49 nodes.

**Verplicht:** backfill `UPDATE … SET synced_at = updated_at` vóór de release, en `synced_at` voortaan vullen bij elke serverwrite en in de seed. Conflicten additief meesturen in de pull-envelope.

## WP-D2 · Canonieke MeasurementSheetRecord-datavorm (PWA + API)

**Bevindingen:** B-205 deel 2 (S2) · **Afhankelijk van:** A2

**Root cause.** `asRecordData()` is een **pure cast** zonder guard. Server/portal-records staan als `{isolation:{…}}`, de PWA schrijft `{sections:{isolation:{…}}}` → `.sections[code]` gooit. Let op: `sheetRecordDataSchema` is momenteel letterlijk `jsonObjectSchema` en kan pas "bron van waarheid" zijn nádat hij écht geschreven is.

**Aanpak.** Kies één canonieke vorm, schrijf het Zod-schema, migreer bestaande rijen (Beheer) en eventueel de Dexie-vorm (PWA). Eenregelige mitigatie vooraf: `asRecordData()` defensief maken (`(data as …)?.sections ?? {}`). **Overweeg een `SYNC_CONTRACT_VERSION`-bump.**

## WP-D3 · Offline-shell hertest + sessiebeleid (PWA)

**Bevindingen:** B-219 (S3 → mogelijk **S1**), B-220 (S3)

**Root cause.** `vite.config.ts` heeft geen `navigateFallback`; in dev genereert `vite-plugin-pwa` maar één precache-entry, dus offline reload/deeplink geeft `ERR_INTERNET_DISCONNECTED` en een niet-geladen route-chunk crasht in de ErrorBoundary. **De severity staat nog niet vast** — dit is gemeten op de dev-server.

**Eerste actie (goedkoop, kan parallel):** hertest tegen `vite build` + `vite preview`. Blijft het bestaan, dan is het **S1** en schuift dit pakket naar golf 1. Hoe dan ook: `navigateFallback: '/index.html'` + `navigateFallbackDenylist: [/^\/api/]`, lazy-import-fouten opvangen met retry + NL-melding, en de belangrijkste routechunks prefetchen zodra de app online is. Deze test hoort in CI **tegen de productiebuild**, niet tegen de dev-server.

**B-220** (offline inloggen na uitloggen onmogelijk, omdat `logout()` de sessie wist) is een product-/securitybeslissing — zie `03-beslispunten-backlog.md`.
