# Claude Code-prompt — vier follow-ups na de release-merge

> Plak alles onder de streep in Claude Code, vanuit de repo-root `InspeXi-Beheer`. De PWA staat op `../Inspexi-App`.
> Basis: Beheer `origin/dev` @ `1877fbd`, PWA `origin/dev` @ `0842c92`. `main` is gesynct.

---

## Fase 0 — lokale checkouts gelijktrekken (eerst doen)

Beide werkkopieën staan nog ver terug: Beheer op `feat/online-repair` (**147 commits** achter `origin/dev`), de PWA op `test/barcode-scanner` (**25 commits** achter). Begin je daar, dan werk je op code van vóór het hele herstelplan.

Beide lokale `dev`-branches zijn **fast-forwardbaar** — dit is dus schoon te doen, zonder merge.

### Beheer

Zestien docs staan lokaal untracked én getrackt op `dev`; die blokkeren de checkout. De versies op `dev` zijn leidend (bijgewerkt tijdens de uitvoering), dus de lokale kopieën mogen weg:

```bash
cd ~/VIBE/InspeXi-Beheer
rm -rf docs/testprogramma
rm -f docs/herstelplan/00-herstelplan.md \
      docs/herstelplan/01-werkpakketten.md \
      docs/herstelplan/02-START-PROMPT-claude-code.md \
      docs/herstelplan/03-beslispunten-backlog.md \
      docs/herstelplan/voortgang/AUDIT-onafhankelijk.md

git checkout dev
git pull --ff-only origin dev
```

De overige untracked bestanden (`docs/IMP_PRD_*`, `docs/gouden-paden.html`, en de vier `PROMPT-*.md`/`PR164-*.md` in `docs/herstelplan/voortgang/` — **inclusief dit bestand**) botsen niet en blijven gewoon staan. Niets om vooraf te back-uppen.

> `test/barcode-scanner` in de PWA heeft één commit die nergens anders zit. Niet verwijderen; overstappen is genoeg.

### PWA

Geen botsingen — `.claude/` en het lege `apps/api/` zijn restanten van de monorepo-split:

```bash
cd ~/VIBE/Inspexi-App
git checkout dev
git pull --ff-only origin dev
```

### Omgeving bijwerken

Overslaan hiervan levert misleidende fouten op (o.a. "Cannot find module 'helmet'" en Prisma-typefouten op velden die wél in het schema staan):

```bash
# Beheer — dependencies zijn gewijzigd (helmet is nieuw)
cd ~/VIBE/InspeXi-Beheer && pnpm install
cd apps/api && npx prisma generate

# 7 nieuwe migraties sinds de oude checkout
docker compose up -d          # Postgres :5433
npx prisma migrate dev        # of: migrate deploy op een bestaande dev-DB
pnpm db:seed                  # schema is fors gewijzigd; verse seed is het veiligst

# PWA — ook gewijzigde dependencies
cd ~/VIBE/Inspexi-App && pnpm install && pnpm build   # shared-package eerst bouwen
```

### Controleren vóór je aan F1–F4 begint

```bash
cd ~/VIBE/InspeXi-Beheer
git log --oneline -1                 # moet 1877fbd of nieuwer zijn
npx turbo run build                  # 6/6 groen, géén helmet-/Prisma-fouten
```

Draai daarna de stack (API `:3001` met `NODE_ENV=test`, portal `:5173`, client-portal `:5174`, PWA `:5176`) en controleer dat je op `inspexidemo.localhost:5173` kunt inloggen. **Herstart de API na de seed** — de tenant-cache houdt 5 minuten vast.

> De `ANTHROPIC_API_KEY` staat al in `apps/api/.env`. Dat bestand is untracked en overleeft de branchwissel; je hoeft er niets mee te doen. F4 is dus uitvoerbaar.

Lukt fase 0 niet volledig, **begin dan niet aan F1–F4** maar meld wat er misgaat.

### Direct na de sync: werkbranches aanmaken

**Blijf niet op `dev` staan** — daar wordt niet op gewerkt. Maak meteen na het pullen alle branches aan en stap over naar de eerste:

```bash
cd ~/VIBE/InspeXi-Beheer
git branch docs/ins01-a3-besluit dev
git branch fix/ai-retention-offboarding dev
git branch chore/ai-agent-live-verificatie dev
git checkout docs/ins01-a3-besluit          # ← hier begin je (F2)

cd ~/VIBE/Inspexi-App
git checkout -b fix/pwa-login-network-error dev   # F1, losse repo
```

Tussen de follow-ups door wissel je met `git checkout <branch>`; `dev` raak je alleen aan om te syncen.

---

Je voert vier losstaande follow-ups uit die na de release-merge zijn overgebleven. Ze zijn **onafhankelijk** — elk een eigen branch en PR.

| | Repo | Branch | Nodig om te draaien | Volgorde |
|---|---|---|---|---|
| **F2** | Beheer | `docs/ins01-a3-besluit` | niets (alleen docs) | 1e |
| **F3** | Beheer | `fix/ai-retention-offboarding` | database | 2e |
| **F4** | Beheer | `chore/ai-agent-live-verificatie` | volledige stack + API-key | **als laatste** |
| **F1** | PWA | `fix/pwa-login-network-error` | niets (Vitest is volledig gemockt) | parallel, wanneer je wilt |

F4 staat bewust achteraan: die kost echte Anthropic-tokens en draai je pas als de rest groen is. F1 zit in een andere repo en botst nergens mee, dus die mag naast het Beheer-spoor lopen.

**Geen worktrees gebruiken.** Een verse worktree mist `apps/api/.env` (met de `ANTHROPIC_API_KEY`) en `apps/api/uploads` — beide gitignored, dus git kopieert ze niet mee — en vraagt een eigen `pnpm install` + `prisma generate`. Bovendien delen alle pakketten dezelfde Postgres op `:5433` en dezelfde poorten, dus F3 en F4 kunnen toch niet naast elkaar draaien.

Vaste werkwijze per follow-up: verifieer eerst de beschreven oorzaak in de actuele code, implementeer inclusief test, draai `npx turbo run build` + de relevante suite, en rapporteer terug wat je hebt gewijzigd en hoe je het hebt geverifieerd. Verzin geen resultaten — als je iets niet kunt draaien, zeg dat.

---

## F1 · NL-melding bij onbereikbare server in de PWA-login

**Repo:** `../Inspexi-App` · **Branch:** `fix/pwa-login-network-error` · **Schatting:** < 1 uur

`apps/inspectie-app/src/services/api/apiClient.ts:218` heeft als laatste fallback:

```ts
responseData?.error?.message || responseData?.message || "Request failed";
```

Staat de API uit terwijl het netwerk wél op is, dan is er geen `responseData` en krijgt de gebruiker het Engelse `"Request failed"` in een verder Nederlandstalige app. Dat is precies het scenario van een inspecteur die 's ochtends inlogt terwijl de backend nog niet draait.

**Wat je doet.** Onderscheid twee gevallen en geef beide een Nederlandse, actiegerichte tekst:
- **Netwerk-/verbindingsfout** (fetch gooit, geen response): iets als "Kan de server niet bereiken. Controleer je verbinding of probeer het later opnieuw."
- **Wel een response, geen bruikbare message**: een generieke NL-fallback in plaats van `"Request failed"`.

Let op dat je de bestaande offline-afhandeling niet doorkruist: bij `navigator.onLine === false` heeft de app al eigen gedrag (offline-banner, offline login met bestaande sessie). Deze fix gaat over "online maar server onbereikbaar".

**Test.** Vitest op `apiClient`: fetch die gooit → NL-netwerkmelding; response zonder message → NL-fallback; response mét servermessage → die blijft leidend (geen regressie op bestaande NL-meldingen).

---

## F2 · INS-01-scriptregel bijwerken op het A3-besluit

**Repo:** `InspeXi-Beheer` · **Branch:** `docs/ins01-a3-besluit` · **Schatting:** < 30 min, alleen documentatie

Beslispunt A3 is beantwoord en geïmplementeerd (PR #176 + InspeXi #40), maar twee documenten beschrijven nog de oude situatie:

- `docs/testprogramma/05-actor-inspecteur-pwa.md`, regel 20 — het verwachte resultaat bij INS-01.
- `docs/testprogramma/bevindingen/logboek-INS.md`, regel 25 — de waarneming "KPI 'Toegewezen 9' telt álle org-plannen, ook 3 met `assignedTo = NULL` (B-223)".

**Wat je doet.** Lees eerst wat A3 feitelijk besloten heeft (`docs/herstelplan/03-beslispunten-backlog.md` §A) en wat PR #176/InspeXi #40 hebben gewijzigd. Herschrijf daarna beide regels zodat ze het huidige gedrag beschrijven. Controleer meteen of B-223a's status in `docs/testprogramma/bevindingen/B-223.md` klopt met de eindstand — die stond op "wacht op beslispunt A3".

Geen codewijziging in dit pakket.

---

## F3 · AI-dataretentie bij deactiveren en verwijderen

**Repo:** `InspeXi-Beheer` · **Branch:** `fix/ai-retention-offboarding` · **Schatting:** 0,5–1 dag

PRD-15 §6.6 belooft dat AI-conversaties automatisch worden gewist bij het **deactiveren én verwijderen** van een gebruiker of organisatie. In de praktijk gebeurt dat niet:

- `AiConversation` heeft `onDelete: Cascade` naar `User`/`Organization` (schema rond regel 1560 — de comment erboven noemt dit zelf al een open follow-up).
- Maar `User` wordt **soft-deleted**: `users.service.ts` `deactivate()` zet alleen `isActive: false` en revoket de refresh-tokens. Er wordt niets verwijderd, dus de cascade vuurt nooit.
- Hetzelfde geldt voor organisaties: die worden op `isActive: false` gezet (offboarding), niet verwijderd.

**Wat je doet.**
1. Bepaal eerst wat "wissen" hier precies moet betekenen — lees PRD-15 §6.6 en §11. Onderscheid conversatie-inhoud (berichten) van metering-/auditgegevens die je waarschijnlijk wél wilt bewaren (`AiUsage`, `AuditLog` met `source = AI`). Wis niet blind alles wat aan de user hangt.
2. Voeg een expliciete opruimstap toe in het deactiveer- én verwijderpad, in dezelfde transactie als de statuswijziging, zodat er geen halve staat kan ontstaan.
3. Doe hetzelfde voor het org-offboardingpad.
4. Log de opruiming in de audit-trail — dit is een gegevensverwijdering en moet herleidbaar zijn.
5. Werk de comment bij `model AiConversation` in het schema bij zodra de follow-up gesloten is.

**Test.** Unit op `deactivate()`: user met conversaties → conversaties weg, metering/audit intact. Idem voor de org-variant. E2E die de hele keten doorloopt als dat zonder Anthropic-key kan.

**Let op.** Als je hiervoor een migratie nodig hebt (bijvoorbeeld een `retentionDays`-kolom), timestamp die ná `20260728110002` — dat is de laatste migratie op `dev`.

---

## F4 · AI-agent live verifiëren tegen de echte Anthropic-API

**Repo:** `InspeXi-Beheer` · **Branch:** `chore/ai-agent-live-verificatie` · **Schatting:** 0,5 dag

De AI-agent (PRD-15, geport in PR #178) is gebouwd en getest met een **gemockte** Anthropic (15 e2e-tests). De streaming-, tool- en bevestigingsketen is nog nooit tegen de echte API gedraaid. De browser-smoke is gedaan zónder key en gaf terecht "De AI-assistent is niet geconfigureerd".

**Vereist:** een `ANTHROPIC_API_KEY` in `apps/api/.env`. **Is die er niet, voer dit pakket dan niet uit** — meld het en ga door met F1–F3.

**Wat je doet met een key.**
1. Zet de key en `ANTHROPIC_AGENT_MODEL` (default `claude-sonnet-5`), start de stack en log in op `inspexidemo.localhost:5173`.
2. Loop de volledige keten één keer echt door: AI-drawer openen → vraag stellen → **streaming** response → een read-tool laten vuren → een write-actie laten voorstellen → bevestigen → controleren dat de mutatie klopt én dat er een `AuditLog` met `source = AI` is weggeschreven.
3. Controleer de metering: `AiUsage` krijgt tokens en een kostenberekening.
4. Verifieer het entitlement-gedrag negatief: bij `testbedrijf` (zonder `AI_AGENT`) hoort de knop afwezig te zijn.
5. **`MODEL_PRICING` bijwerken indien nodig** (`apps/api/src/modules/ai-agent/ai-config.ts`): die kent nu alleen `claude-sonnet-5` (300/1500 cent per Mtok) en `claude-opus-4-8` (500/2500). Een onbekend model valt terug op `FALLBACK_PRICE` = het Opus-tarief. Zet je een ander model in, voeg het dan expliciet toe — anders klopt de metering stil niet.
6. Documenteer de uitkomst in `docs/herstelplan/voortgang/logboek.md` en haal het restpunt uit de PR-body van #178 weg.

**Belangrijk.** Dit kost echte tokens. Houd het bij één beknopte sessie; ga niet uitgebreid experimenteren.

---

## Afronden

Werk per follow-up `docs/herstelplan/voortgang/logboek.md` bij, en verwijder de afgeronde punten uit de lijst met kleine follow-ups in `docs/herstelplan/voortgang/restrisico.md`. Rapporteer terug welke van de vier zijn afgerond, welke zijn overgeslagen (met reden), en wat er aan restrisico overblijft.
