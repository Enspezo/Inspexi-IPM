# Startprompt voor Claude Code — uitvoering herstelplan

> Plak alles onder de streep in Claude Code (vanuit de repo-root `InspeXi-Beheer`). De hoofdagent orkestreert en delegeert maximaal naar subagents.
>
> **Per golf één sessie.** Golf 2 en 3 hebben elk ~10 respectievelijk 5 werkpakketten; die passen niet in één context. Start elke golf met dezelfde prompt en vervang alleen de golf-aanduiding in stap "Uitvoering".

---

Je gaat het herstelplan uit `docs/herstelplan/` uitvoeren: 75 bevindingen uit het autonome testprogramma, opgeknipt in 22 werkpakketten. Lees eerst **`docs/herstelplan/00-herstelplan.md`** en **`01-werkpakketten.md`** volledig — die zijn leidend. De bevindingen zelf staan in `docs/testprogramma/bevindingen/` (branch `test/smoke-programma`). De PWA-repo staat op `../Inspexi-App`.

Werk als **orkestrator**: jij regelt setup, volgorde en consolidatie, en delegeert elk werkpakket naar een eigen subagent. Houd een takenlijst bij.

## Harde randvoorwaarden

- **Verifieer elke root cause in de actuele code vóór je iets wijzigt.** De bevindingen zijn opnieuw gecontroleerd, maar er is er al één deels achterhaald (B-104). Klopt een bevinding niet meer, dan noteer je dat in het bevindingsbestand en sla je hem over.
- **Eén PR per werkpakket.** Branch `fix/wp-<code>-<korte-titel>` vanaf de afgesproken basis. Pakketten die beide repo's raken (A2, B10, D1, D2) krijgen twee PR's die naar elkaar verwijzen.
- **Elke PR bevat de tests die in het werkpakket genoemd staan.** Een fix zonder regressietest is niet af — de S1's ontstonden juist door ontbrekende dekking.
- **Verzin nooit resultaten.** Elke acceptatiecheck voer je echt uit: draai de tests, en hertest de bijbehorende testgevallen uit `docs/testprogramma/0x-actor-*.md` in de browser zoals de originele run.
- Apps via **subdomein**: portal `<slug>.localhost:5173`, client-portal `:5174`, PWA `:5176`, superuser `mijn.localhost:5173`. API op **:3001** met `NODE_ENV=test` (throttle uit). Herstart de API na elke seed.

## Fase 0 — Setup (hoofdagent zelf)

1. **Bepaal de basisbranch.** De bevindingen zijn getest tegen `dev`; de huidige werkbranch is `feat/online-repair`. Stel vast welke de basis wordt (waarschijnlijk `dev` ná het mergen van `feat/online-repair`) en leg dat vast in het uitvoerlogboek. Rebase alle WP-branches daarop.
2. **Merge de docs.** `test/smoke-programma` bevat de bevindingen en is nog niet gemerged. Merge die branch (of cherry-pick `docs/testprogramma/`) naar de basis — anders werken de WP-branches met bestanden die er niet zijn.
3. Dev-stack draaiend krijgen: `pnpm install`, `docker compose up -d`, `pnpm db:migrate`, seed, API met `NODE_ENV=test`. Poorten vrijmaken: `lsof -ti:3001 -ti:5173 -ti:5174 -ti:5176 | xargs kill -9`.
4. Smoke: laadt elke app op zijn poort/subdomein?

## Uitvoering — **GOLF 1** (vervang dit per sessie)

Delegeer **één subagent per werkpakket**. Geef elke subagent mee: het WP-nummer, de bevindingsbestanden die hij volledig moet lezen, het relevante deel van `01-werkpakketten.md`, en de acceptatiecriteria.

**Parallellisatie — let op de gedeelde bronnen.** Er is één database, één dev-stack en één browsersessie:

- **Code schrijven mag parallel** zolang de pakketten andere bestanden raken. Golf 1: A1/A2 (PWA) botsen niet met A3 (API) of A4 (client-portal) → start A3 en A4 parallel met het PWA-spoor.
- **Binnen het PWA-spoor is de volgorde strikt: A1 vóór A2.** Zonder zichtbare syncfouten is A2 niet betrouwbaar te valideren.
- **Browserverificatie is sequentieel.** Laat subagents hun code + unit-tests afmaken en meld terug; de browsercheck plan jij als orkestrator één voor één in.
- **Pakketten die de DB-schema of seed wijzigen (A2, B3, B5, C5, D1, D2) mogen nooit gelijktijdig migreren.** Serialiseer die.

Volgorde per golf:

- **Golf 1:** A1 → A2 (PWA, strikt) · A3, A4 (parallel)
- **Golf 2:** B3, B4, B5, B6, B7, B8 (API/portal, grotendeels parallel) · B1 → B2 → B10 (PWA, in volgorde) · B9 (na A4)
- **Golf 3:** C1, C2, C3, C4, C5 (grotendeels parallel; C1 raakt veel bestanden — plan die als eerste en laat de rest erop rebasen)
- **Golf 4:** D3 eerst (goedkope hertest, kan de prioriteit omgooien) · daarna D1 en D2 ná de beslispunten A1/A2 uit `03-beslispunten-backlog.md`

## Wat elke subagent doet

1. Lees de toegewezen bevindingsbestanden volledig (`git show test/smoke-programma:docs/testprogramma/bevindingen/B-xxx.md` als ze nog niet gemerged zijn) — inclusief Reproductie en Bewijs.
2. Verifieer de root cause in de actuele code.
3. Implementeer volgens `01-werkpakketten.md`, inclusief de genoemde tests.
4. Draai `npx turbo run build` + de relevante unit-/e2e-suite.
5. Werk het bevindingsbestand bij met een `## Status`-sectie (opgelost / deels / vervallen + PR-verwijzing).
6. Rapporteer terug: wat gewijzigd, welke tests toegevoegd, welke acceptatiecriteria nog browserverificatie nodig hebben, en expliciet de restrisico's.

## Let op — valkuilen die in de analyse naar boven kwamen

- **De seed bevat bewust ongeldige fixtures** die door nieuwe validaties geraakt worden: `TP-OFF-010` (negatieve prijs, korting 150%, btw 250%) botst met B5, en het globale template `MS-SU17-TEST` (`min 100 / max 0`) botst met C5. Pas de seed in hetzelfde pakket aan, anders breekt de seed.
- **Bestaande specs asserten op Engelse foutteksten.** Grep vóór C1 op `must not be less than`, `Forbidden resource`, `Unauthorized`.
- **De Dexie-repairhook in A2 is niet optioneel.** Zonder die hook blijft het dataverlies bestaan op toestellen die al pending records met de foute FK hebben — ook ná de fix.
- **`table-layout: fixed` (C4) en `truncate` (C4) zijn visueel breed.** Genereer vóór en ná een representatieve set documenten/schermen en vergelijk.
- **Vier fixes vragen een datacheck vóór productie** — zie `00-herstelplan.md` §8. Voer die queries uit en rapporteer de uitkomst; wijzig geen productiedata zonder overleg.
- **De beslispunten in `03-beslispunten-backlog.md` §A blokkeren golf 4.** Start D1/D2 niet zonder antwoord; leg de vraag terug bij de eigenaar.

## Rapportage

Maak `docs/herstelplan/voortgang/`:

- `logboek.md` — per werkpakket: branch, PR, status, welke bevindingen afgehandeld, welke tests toegevoegd.
- `restrisico.md` — bevindingen die bewust niet zijn opgelost, met reden (achterhaald / beslispunt / epic).
- Werk de statustabel in `00-herstelplan.md` §3 bij zodra een pakket gemerged is.

Rond elke golf af met een korte terugkoppeling: aantal opgeloste bevindingen per severity, welke risicogebieden uit `07-cross-tenant-security.md` daarmee van NO-GO naar GO gaan, en wat er nog openstaat.

Begin met Fase 0 en een takenlijst.
