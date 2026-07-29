# Code review PR #128 — PRD-14 Online herstel

*Reviewrange: `7407f42..2dad042` (6 fase-commits, 96 bestanden, +9.798/-81). Gereviewd: 17 juli 2026.*

## Samenvatting

Nette, PRD-getrouwe implementatie: de first-wins-claim is correct atomisch, de anti-enumeratie-lookup en tenant-isolatie zitten goed, de herstelverklaring is XSS-veilig (Handlebars-escaping + gevalideerde data-URI's) en de E2E-dekking is vrijwel volledig. Er zijn géén critical issues, wel één high (HTML-injectie in e-mails) en één privacy-afwijking van het PRD (herstellernaam zichtbaar in het klantportaal) die vóór merge gefixt moeten worden.

## Blokkerend (fixen vóór merge)

| # | Bestand | Regel | Issue | Ernst |
|---|---|---|---|---|
| 1 | `apps/api/src/modules/client-repair/repair-email.service.ts` | 42, 70, 80, 43/81/112 | **HTML-injectie in herstel-e-mails.** `recipientName` (= `session.contactName`) en de werkzaamheden-`description` — vrije tekst van een **anonieme** invuller — worden rauw in de e-mail-HTML naar opdrachtgever en PM geïnterpoleerd (phishing/content-injectie). Fix: alle geïnterpoleerde waarden door een `escapeHtml()` halen of de mails via Handlebars renderen (escapet standaard). | 🔴 High |
| 2 | `client-findings.service.ts` r62 + `client-portal .../finding-detail-modal.tsx` ~r251 | — | **Herstellernaam lekt naar het klantportaal.** `claimFinding` zet `resolvedByClientUserId`; de bestaande client-findings-serializer selecteert `resolvedByClientUser { firstName, lastName }` en de modal toont "Gemeld op … door {naam}". PRD §14.3 besluit 4: klantportaal toont nooit wie herstelde. Fix: `resolvedByClientUser` nullen voor `REPORTED`/`CONFLICT`-resoluties in de client-serializer (staf mag het wel zien). | 🟠 Medium (privacy/PRD) |
| 3 | `inspection-plans.service.ts` | 345-346 vs 438-445 | **referenceNumber wijzigbaar terwijl online herstel aan staat.** `assertOnlineRepairReference` draait alleen als `dto.onlineRepairEnabled` meekomt; een PATCH met alléén `referenceNumber` kan het nummer legen of dupliceren op een al-enabled plan → anonieme lookup (`findFirst`) matcht dan een willekeurig plan. Fix: ook valideren wanneer `dto.referenceNumber !== undefined && (dto.onlineRepairEnabled ?? existing.onlineRepairEnabled)`. | 🟠 Medium |
| 4 | `inspection-plans.service.ts` | ~260-276 | **create() kan enabled starten zonder ref-validatie.** Het org-default-pad zet `onlineRepairEnabled = true` bij aanmaak (entitlement-check klopt), maar valideert `dto.referenceNumber` niet op gevuld/uniek — zelfde invariant-schending als #3. Fix: zelfde validatie bij create, of vlag uit laten wanneer de ref leeg/duplicaat is. | 🟠 Medium |

## Aanbevolen (mag ook direct erna)

| # | Bestand | Issue | Ernst |
|---|---|---|---|
| 5 | `sync/sync.service.ts` ~548, 583-593 | **Reopen-reset vuurt vóór de LWW-conflictcheck.** `applyFindingCriticalFields` reset `criticalRepairNotifiedAt` ook wanneer `applyUpdate` de push daarna als `conflict` afwijst (stale PWA-data) → mogelijke dubbele HERINSPECTIE_VOORSTEL. Fix: reset pas na `status: 'success'`. | 🟠 Medium |
| 6 | `client-repair.service.ts` `sign()` r921-936 | **Handtekening wordt SIGNED vóór de Puppeteer-render.** Faalt `renderPdf` (geen Chromium/timeout), dan is de signature al SIGNED en geeft opnieuw ondertekenen "Geen openstaande handtekening gevonden". Herstelbaar door opnieuw af te ronden (complete regenereert het concept), maar verwarrend. Fix: eerst PDF renderen, daarna pas muteren (of alles in één transactie). | 🟠 Medium |
| 7 | `findings.service.ts` (create) + sync | **Nieuwe kritieke constatering her-armt de trigger niet.** Na een gevuurde HERINSPECTIE_VOORSTEL blokkeert `criticalRepairNotifiedAt` een tweede trigger, ook als er daarna een níeuwe open kritieke constatering bijkomt (create of classificatiewijziging). Fix: reset ook wanneer een open finding kritiek wordt. | 🟡 Low |
| 8 | `repair-session.guard.ts` r46-52 | **Lazy expiry flipt ook COMPLETED → EXPIRED.** Na 72u verliest een afgeronde sessie haar eindstatus én werkt de PDF-download niet meer, met de misleidende melding "log opnieuw in". Fix: statusflip + weigering conditioneren op `status === ACTIVE`; COMPLETED leesbaar houden (of nette melding). | 🟡 Low |
| 9 | `client-repair.service.ts` r454-460 + schema | **Same-session dubbelklik-race.** De `mine`-precheck is niet atomisch: twee parallelle claims uit dezelfde sessie kunnen REPORTED + CONFLICT opleveren, inclusief onterechte conflictmail naar PM/opdrachtgever. Fix: `@@unique([findingId, repairSessionId])` op FindingResolution (P2002 → nette 400). | 🟡 Low |
| 10 | `inspection-plans.service.ts` r232 | Uniciteitscheck mist whitespace-padded opgeslagen refs (`' RAP-1 '` vs `RAP-1`); lookup normaliseert wél beide kanten. Fix: referenceNumber trimmen bij schrijven (of `TRIM()` in de check). | 🟡 Low |
| 11 | `client-inspections.service.ts` ~r249 | `criticalRepairNotifiedAt` (staf-intern procesveld) lekt mee in het klantportaal-detail via de spread. Fix: strippen in de destructuring. | 🟡 Low |
| 12 | `apps/portal/.../online-repair-section.tsx` + `lib/client-portal.ts` | Gekopieerde herstel-URL is fout op het SUPERUSER-domein (`mijn.….5174/herstel`). Fix: slug van de plan-org gebruiken of sectie daar verbergen. | 🟡 Low |
| 13 | `common/audit/` + `prisma.service.ts` r80 | Anonieme mutaties worden **niet** geauditeerd (middleware skipt zonder userId; `AuditLog.userId` NOT NULL) — afwijking van PRD §14.5 ("orgId + IP wél gelogd"), nu alleen in een comment gedocumenteerd. Besluit nodig: userId nullable maken of PRD-tekst bijstellen. | 🟡 Low |
| 14 | `client-portal .../repair-claim-modal.tsx` ~r45 | Na gelukte claim + gefaalde foto-upload wordt een naderhand bewerkte omschrijving stil genegeerd bij opnieuw versturen. Fix: textarea disablen zodra geclaimd. | 🟡 Low |
| 15 | tests | Ontbrekend: Vitest voor de 401→`/herstel`-redirect-hook; E2E voor `GET /client/repair/session` op een COMPLETED-sessie. | 🟡 Low |

## Wat goed zit

- **Claim-concurrency correct**: atomische `updateMany` op `statusCode='open'` binnen een transactie; verliezer krijgt bewaard CONFLICT-concept + 409 — exact PRD §14.3 besluit 3.
- **Anti-enumeratie consequent**: alle vier lookup-faalpaden geven dezelfde generieke melding (met `Logger.warn` + IP); bewust géén feature-gate op lookup zodat een 403 niets verraadt.
- **Geen XSS in de herstelverklaring**: Handlebars-escaping op alle gebruikersvelden, foto's/logo als data-URI's, handtekening-injectie gevalideerd op `data:image`-charset; concept vervangt i.p.v. stapelt; frontend-preview in `<iframe sandbox>`.
- **isCritical écht server-owned**: niet in de sync-whitelist, identiek berekend in staf-create/update, sync-push (met cache, geen N+1) en het idempotente, gebatchte backfill-script; 41 unit tests.
- **Migraties veilig** (enum ADD VALUE niet in dezelfde migratie gebruikt, fast defaults), seed-opruimvolgorde klopt, system-lookups onvoorwaardelijk geseed, E2E-conventies (e2e-prefix, try/finally, kinderen-eerst) netjes gevolgd.
- **Frontend volgens PRD**: token in memory + sessionStorage, wizard-validaties compleet en NL, mobiel-eerst, hergebruik PhotoUploader/SignatureCanvas.

## Verdict

**Request changes** — #1 t/m #4 vóór merge (één e-mail-escaping-fix, één serializer-fix, twee validatiepaden in inspection-plans); #5-#15 kunnen desgewenst in een kleine follow-up-PR. De architectuur en testdekking zijn op orde; na deze fixes kan hij wat mij betreft door.
