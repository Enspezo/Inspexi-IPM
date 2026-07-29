# Claude Code-prompt — reviewcorrecties op de vier follow-up-PR's

> Plak alles onder de streep in Claude Code. Kleine opdracht: drie correcties, daarna mergen.
> Basis: Beheer `origin/dev` @ `1877fbd`, PWA `origin/dev` @ `0842c92`.

---

De vier follow-up-PR's (F1–F4) zijn gereviewd. Drie correcties vóór de merge, daarna mergen en de restpunten vastleggen. **Werk niet op `dev`** — blijf per correctie op de bestaande feature-branch.

## R1 · Getalcorrectie in F2 (branch `docs/ins01-a3-besluit`)

Het aantal toegewezen plannen in het seed-scenario is **6**, niet 4. Nageteld: 5× `assign: true` in `apps/api/prisma/seed-tp/inspectie.ts` plus het demoplan in `apps/api/prisma/seed.ts`, allemaal naar dezelfde inspecteur — en dat sluit aan op 9 totaal min 3 met `assignedTo = NULL`. De "4" komt uit de unittest-fixture in `plan-assignment.test.ts` (4× ME, 2× collega, 3× null); die beschrijft niet het seed-scenario waar het logboek naar verwijst.

Twee regels, in dezelfde commit:

1. `docs/testprogramma/bevindingen/logboek-INS.md` regel 25 — `KPI "Toegewezen" telt nu alleen eigen plannen (4 i.p.v. 9)` → **`(6 i.p.v. 9)`**
2. `docs/testprogramma/bevindingen/B-223.md` regel 25 — `(in het bevinding-scenario: 4 i.p.v. 9)` → **`(6 i.p.v. 9)`**

De tweede staat al fout op `dev`; neem hem hier mee, anders blijft hij staan.

**Verifieer het getal zelf** vóór je wijzigt (`grep -c "assign: true" apps/api/prisma/seed-tp/inspectie.ts` + het demoplan in `seed.ts`). Klopt 6 niet, meld dat dan in plaats van blind te wijzigen.

Overweeg daarnaast de status van INS-01 in `logboek-INS.md`: die staat op PASS tegen het oude orakel, terwijl het orakel nu herschreven is. Markeer als "PASS (oud orakel) — hertest open" óf draai de hertest en noteer het werkelijke getal.

## R2 · Systeemprompt + bevestigingskaart in F4 (branch `chore/ai-agent-live-verificatie`)

`apps/api/src/modules/ai-agent/ai-config.ts` instrueert het model nog steeds dat het niet kan schrijven, terwijl `tool-registry.ts` de write-tools onvoorwaardelijk registreert en naar de API stuurt. Dat de write-keten tijdens de live-run tóch werkte is modelafhankelijk geluk, geen garantie.

Vervang de regel:

```diff
-- Je kunt (nog) geen gegevens wijzigen of aanmaken. Schrijfacties komen in een latere versie en worden dan altijd eerst door de gebruiker bevestigd. Bied ze niet aan alsof je ze nu kunt uitvoeren.
+- Je kunt gegevens aanmaken en wijzigen met de daarvoor bestemde tools. Elke schrijfactie wordt eerst als voorstel aan de gebruiker getoond en pas uitgevoerd nadat die hem bevestigt. Zeg daarom nooit dat iets al gebeurd is voordat je de bevestiging terugkrijgt: beschrijf wat je gaat doen en wacht af.
+- Stel één schrijfactie tegelijk voor. Verzin nooit verplichte gegevens die je niet zeker weet — vraag ze aan de gebruiker in plaats van een plausibele waarde in te vullen.
```

Die tweede regel dekt precies wat de live-run blootlegde: een model dat verplichte velden zelf invult koppelt een taak stilzwijgend aan het verkeerde record.

Vul in hetzelfde pakket de bevestigingskaart aan (`tool-registry.ts`, `summarize` van `create_task`) — de PR maakt de entiteitkoppeling verplicht, maar de gebruiker ziet hem niet in wat hij bevestigt:

```diff
 summarize: (i) =>
   `Taak aanmaken: "${i.title}"` +
+  (i.entityType ? ` bij ${i.entityType.toLowerCase()} ${i.entityId}` : '') +
   (i.assigneeId ? `, toegewezen aan ${i.assigneeId}` : '') +
   (i.deadline ? `, deadline ${i.deadline}` : ''),
```

Twee kleinigheden die er meteen bij kunnen: de nieuwe enum-test asserteert maar 2 van de 7 waarden (`toEqual([...alle 7])` is strakker en vangt drift met `TaskEntityType`), en in `restrisico.md` staat de nieuwe AI-agent-regel achter een lege regel waardoor hij buiten de tabel valt.

## R3 · Notitie bij F3 (branch `fix/ai-retention-offboarding`) — geen code

De review vlagde "geen backfill voor reeds gedeactiveerde users/orgs" als blokkerend. Dat is praktisch leeg: de AI-agent is pas op 28-07 naar `dev` geport en draaide tot vandaag zonder `ANTHROPIC_API_KEY`, dus er kan geen productieachterstand bestaan. **Verifieer die aanname** (draaide de AI-agent ooit in productie? zijn er `AiConversation`-rijen?) en leg de uitkomst vast in de PR-body en `docs/herstelplan/voortgang/logboek.md`. Bouw géén migratie zolang de aanname klopt.

## Mergen

Na R1–R3, in deze volgorde:

1. `fix/pwa-login-network-error` (PWA)
2. `fix/ai-retention-offboarding` (Beheer)
3. `docs/ins01-a3-besluit` (Beheer, na R1)
4. `chore/ai-agent-live-verificatie` (Beheer, na R2)

Draai vóór elke merge de relevante suite; na de laatste merge één keer `npx turbo run build` + de volledige API-suite op `dev`.

## Restpunten vastleggen (niet bouwen)

Zet deze in `docs/herstelplan/voortgang/restrisico.md` met bron-PR, zodat ze traceerbaar zijn:

- **PWA `apiClient`** — `upload()` en `getBlob()` hebben nog geen try/catch en tonen `"Upload failed"` / `"Failed to fetch …"`. Die tekst komt via `syncRetryMeta.lastError` daadwerkelijk in de `SyncErrorBadge` bij de gebruiker. Zelfde klasse als F1, ander codepad. Ook `"Session expired"` staat er nog.
- **Deactiveren wist nu onomkeerbaar AI-gesprekken**, maar `organization-detail-page.tsx` belooft nog reversibiliteit ("totdat de organisatie weer geactiveerd wordt") en `user-detail-page.tsx` heeft er geen bevestigingsdialoog voor.
- **Org-purge zonder expliciete transactie-timeout** — de default van 5s geldt; bij een grote tenant kan de cascade over `AiMessage`/`AiPendingAction` P2028 geven, waarna de deactivering óók faalt.
- **`aiConversation.deleteMany({ where: { userId } })`** mist `orgId` — de enige index is `[orgId, userId, updatedAt]`, dus dit wordt een sequential scan binnen een open transactie. `orgId` toevoegen is meteen defense-in-depth.
- **AI-foutmeldingen** — een gefaalde tool-run geeft de rauwe (Engelse) Prisma-melding door aan de client; het logboek noemt dat ten onrechte "nette NL-afhandeling".

Rapporteer terug: welke correcties zijn doorgevoerd, wat de verificatie van het getal en de F3-aanname opleverde, welke PR's gemerged zijn, en of de eindsuite groen is.
