# Actor: Klant (client-portal) + Publieke/anonieme flows — testscript (KL-xx / PUB-xx)

**Client-portal:** `http://inspexidemo.localhost:5174` (**poort 5174**)
**Publieke pagina's (in de portal, zonder login):** `/offerte/:token`, `/afspraak/:token`, `/sign/:requestId` op `:5173`; anoniem herstel op client-portal `/herstel`.
**Auth:** eigen realm (ClientUser). Demo-login zonder wachtwoord: `http://inspexidemo.localhost:5174/magic/demo-klant-magic` (vereist `SEED_DEMO=1`, 30d TTL).
**Risicogebieden:** R7 (online herstel/first-wins/enumeratie), R2 (publieke offerte), R8 (ondertekenen), R1 (isolatie).

---

## Client-portal — login & toegang

| ID | T | Stap / invoer | Verwacht (orakel) |
|---|---|---|---|
| KL-01 | G | Open magic-link `/magic/demo-klant-magic` | Direct ingelogd zonder wachtwoord; dashboard laadt |
| KL-02 | F | Magic-link **2×** gebruiken (na 1e login opnieuw openen) | Tweede keer geweigerd (one-time, `usedAt`) — nette melding |
| KL-03 | F | **Verlopen** magic-link | Nette "verlopen"-melding, geen crash |
| KL-04 | G | Klassieke registratie via magic-token → wachtwoord instellen | Account PENDING→ACTIVE; kan inloggen |
| KL-05 | B | Registratie-wachtwoord 7 tekens | Geweigerd (`@MinLength(8)` + frontend confirm-refine) |
| KL-06 | F | Login met fout wachtwoord | 401 generiek; geen accountonthulling |
| KL-07 | A | Client-JWT gebruiken op een **staf**-endpoint (`/api/v1/contacts`) | Geweigerd (aparte realm; staf-guard) |

## Inspecties inzien & constateringen oplossen (R7)

| ID | T | Stap | Verwacht |
|---|---|---|---|
| KL-08 | G | Dashboard → inspectie → detail, tabs Overzicht/Constateringen/Berichten/Documenten | Alles laadt; alleen eigen inspecties zichtbaar |
| KL-09 | G | Constatering oplossen: beschrijving + 1–5 foto's uploaden | Resolution status PENDING ("wacht op verificatie") |
| KL-10 | B | **6 foto's** uploaden (max 5) | 6e geweigerd (`max 5`) |
| KL-11 | B | Foto > 5 MB / niet-jpeg-png | Geweigerd (5 MB, `image/jpeg|png|jpg`) |
| KL-12 | B | Beschrijving 4001 tekens | Geweigerd (`@MaxLength(4000)`) |
| KL-13 | A | Ingediende oplossing intrekken zolang PENDING; daarna na verificatie proberen | Intrekken kan bij PENDING; niet meer na verificatie |
| KL-14 | A | Klant-zijde: kan de klant zien **wie** herstelde? | Nee — klant ziet nooit invullergegevens (staf wél) |
| KL-15 | G | Bericht sturen in Berichten-tab + bijlage | Verschijnt; staf ontvangt; ongelezen-teller klopt |

## Documenten ondertekenen (R8)

| ID | T | Stap | Verwacht |
|---|---|---|---|
| KL-16 | G | Document (PENDING_SIGNATURES) → bekijken → tekenen (canvas) | Eigen handtekening SIGNED |
| KL-17 | G | Alle vereiste handtekeningen gezet | Document → SIGNED |
| KL-18 | A | Ondertekenen door een **VIEWER**-client (geen SIGNER-rol) | Geweigerd/knop afwezig |
| KL-19 | A | Ondertekenen van een al **FINALIZED** document | Geblokkeerd |
| KL-20 | B | Handtekening-payload > 5 MB of verkeerde data-URI | Geweigerd (`IsSafeDataImage`, ≤5 MB, `data:image/(png|jpeg|jpg|webp)`) |

## Verzoeken indienen

| ID | T | Stap | Verwacht |
|---|---|---|---|
| KL-21 | G | Nieuw verzoek: herinspectie (plan + beschrijving + voorkeursdatum) | ClientRequest PENDING_REQUEST; staf ziet 'm |
| KL-22 | F | Verzoek met lege beschrijving | Geweigerd (`@IsNotEmpty`) |
| KL-23 | A | Probeer in de body een **andere org** mee te geven | Genegeerd — org komt uit subdomein, nooit uit body |

## Publieke offerte-flow (anoniem)

| ID | T | Stap | Verwacht |
|---|---|---|---|
| PUB-01 | G | Open `/offerte/:token` (VERSTUURD) anoniem | Offerte zichtbaar; 1e opening → BEKEKEN |
| PUB-02 | G | Vraag stellen + daarna ondertekenen | GEACCEPTEERD; PDF gestempeld+gemaild; project+planning auto |
| PUB-03 | F | Ongeldig/gemanipuleerd token | Nette 404, geen datalek |
| PUB-04 | A | Reeds GEACCEPTEERDE offerte opnieuw tekenen | Geblokkeerd |

## Publieke document-ondertekening

| ID | T | Stap | Verwacht |
|---|---|---|---|
| PUB-05 | G | Open `/sign/:requestId` (signature-request) anoniem → tekenen | Handtekening geregistreerd; doc-status verschuift |
| PUB-06 | F | Ongeldig requestId | 404, geen crash |

## Online herstel — anoniem (R7, first-wins, enumeratie)

| ID | T | Stap / invoer | Verwacht |
|---|---|---|---|
| PUB-07 | G | Anoniem `/herstel`: rapportnummer `RAP-TEST-100` + postcode `1012AB` | Sessie ACTIVE (72u); constateringen zichtbaar |
| PUB-08 | F | **Fout** rapportnummer óf **fout** postcode | Altijd **generieke 404** (anti-enumeratie), nooit "nummer klopt maar postcode niet" |
| PUB-09 | F | Postcode met spaties/kleine letters `1012 ab` | Genormaliseerd (uppercase, spaties strip) → matcht |
| PUB-10 | G | Kritieke finding herstel melden + foto | Resolution REPORTED; finding open→resolved (first-wins) |
| PUB-11 | O | **First-wins race**: twee tabs claimen dezelfde finding vrijwel gelijk | Winnaar resolved; verliezer **409**, invoer bewaard als CONFLICT |
| PUB-12 | F | Dubbelklik binnen **één** sessie op dezelfde finding | 400 "U heeft deze constatering al hersteld gemeld" (uniek-constraint) |
| PUB-13 | G | Alle **kritieke** findings opgelost | Eenmalige HERINSPECTIE_VOORSTEL-dispatch naar PM |
| PUB-14 | G | Herstel afronden → herstelverklaring genereren + ondertekenen (rol HERSTELLER) | HERSTELVERKLARING-document met foto's; bevestigingsmail |
| PUB-15 | B | Herstel-lookup 6× in een minuut (throttle 5/min) | 6e → 429 (**dit testgeval draait bewust zónder `NODE_ENV=test`**) |
| PUB-16 | A | Herstel proberen op org **zonder** `ONLINE_HERSTEL`-entitlement of plan met vlag uit | Lookup faalt generiek (geen herstel mogelijk) |
