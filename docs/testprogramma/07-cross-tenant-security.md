# Cross-tenant, autorisatie, sessies & throttling — testscript (SEC-xx)

**Doel:** verifieer multi-tenant isolatie (R1), rol-autorisatie (R5) en robuustheid van sessies/throttling. Dit zijn de zwaarst gewogen risico's — voer ze zorgvuldig uit.
**Apps:** portal `:5173`, client-portal `:5174`, PWA `:5176`, API `:3001`.

**Techniek:** gebruik twee browsercontexten/sessies (org A = `inspexidemo`, org B = `testbedrijf`). Voor API-niveau-tests: bewaar een geldig access-token van org A en probeer daarmee resources van org B te lezen/muteren (via DevTools of directe fetch met de juiste `Host`-header). Verifieer statuscodes via `read_network_requests`.

Legenda **T**: A=autorisatie, I=isolatie, S=sessie, TH=throttle.

---

## Rol-autorisatie (verticaal — mag deze rol dit?)

| ID | T | Stap | Verwacht |
|---|---|---|---|
| SEC-01 | A | ORG_ADMIN opent SUPERUSER-route `/organizations` / `/plans` | 403 / geen toegang |
| SEC-02 | A | ORG_ADMIN opent `/classification-models`, `/norm-types`, `/measurement-sheet-templates` | Geen toegang (SUPERUSER-only) |
| SEC-03 | A | INSPECTEUR muteert een contact / offerte via UI én via directe API-call | 403; geen schrijfrechten op CRM |
| SEC-04 | A | BACKOFFICE keurt een offerte goed die MANAGER-approval vereist | Geweigerd (approver-rol) |
| SEC-05 | A | WERKVOORBEREIDER opent org-instellingen | Geen toegang (admin-only) |
| SEC-06 | A | INSPECTEUR genereert/ondertekent een rapport in de portal | Geen rechten (alleen-lezen inspectiedomein) |

## Cross-tenant isolatie (horizontaal — org A vs org B)

| ID | T | Stap | Verwacht |
|---|---|---|---|
| SEC-07 | I | Met org A-token: `GET /contacts/:id` van een org B-contact | 404 (niet 403 — bestaan niet onthullen) |
| SEC-08 | I | Org A injecteert org B-UUID's in een create/update (bv. `contactId`, `assignedTo`, `scopeLocationIds`) | 403/400 via `assertSameOrg`/`assertAllSameOrg`; geen kruis-koppeling |
| SEC-09 | I | Org A opent org B-subdomein-URL van een offerte/plan-detail | Geen data; redirect/404 |
| SEC-10 | I | ClientUser van org A opent inspectie-id van org B | 404; client-realm is org-gescoped |
| SEC-11 | I | Publieke offerte-token van org A → probeer org B-context | Token bindt aan eigen org; geen kruislek |
| SEC-12 | I | PWA: inspecteur org A opent plan-id org B via URL-manipulatie | 404 (kruisverwijzing INS-44) |
| SEC-13 | I | Herstel-lookup op org A met een rapportnummer dat in org B bestaat | Generieke 404 (referenceNumber is per-org uniek; geen match cross-org) |

## Sessies & tokens (S)

| ID | T | Stap | Verwacht |
|---|---|---|---|
| SEC-14 | S | Staf access-token verlopen (15m) → doe een actie → refresh-flow | Auto-refresh (httpOnly cookie); actie slaagt zonder herlogin, of nette redirect naar /login |
| SEC-15 | S | Gedeactiveerd account met nog geldig token | Volgende server-call weigert (401 "gedeactiveerd") |
| SEC-16 | S | Staf password-reset-link 2× gebruiken / na wachtwoordwijziging | Single-use (pwStamp); tweede keer ongeldig |
| SEC-17 | S | Client-token (1u) op staf-realm en omgekeerd | Wederzijds geweigerd |
| SEC-18 | S | Repair-sessie na 72u (simuleer via ouder token/DB) | Verlopen; COMPLETED blijft leesbaar, mutaties geweigerd |

## Throttling & enumeratie (TH) — draai bewust zónder `NODE_ENV=test`

| ID | T | Stap | Verwacht |
|---|---|---|---|
| SEC-19 | TH | 11× `POST auth/login` in <1 min | 11e → 429 (limiet 10/min) |
| SEC-20 | TH | 6× herstel-lookup / 21× magic-link | 429 op de grens (5 resp. 20/min) |
| SEC-21 | TH | Org-subdomein-enumeratie: 4× onbestaand subdomein binnen 5 min | Na 3 fouten → 429 + Retry-After (5 min blokkade) |

> **Belangrijk:** SEC-19..21 falen als de API met `NODE_ENV=test` draait (throttle uit). Draai dit blok apart met normale env, of markeer als "niet getest" met reden.

---

## Verificatie-samenvatting (go/no-go per risicogebied)

Vul na uitvoering in `bevindingen/SAMENVATTING.md`:

| Risico | Getest via | Oordeel (GO / NO-GO / met risico) |
|---|---|---|
| R1 Isolatie | SEC-07..13, INS-43/44 | |
| R2 Offerte-lifecycle | BO-13..33, PUB-01..04 | |
| R3 Review-gate | BO-43..46, INS-41 | |
| R4 Sync/offline | INS-36..42 | |
| R5 Autorisatie | SEC-01..06, BO-08/51 | |
| R6 Validatie | BO-13..20, INS-12/21..24, div. F | |
| R7 Online herstel | PUB-07..16 | |
| R8 Documenten/tekenen | BO-47..50, KL-16..20, PUB-05/06 | |
| R9 Planning/beschikbaarheid | BO-34..40 | |
| R10 Onboarding | SU-01..12, OA-09..17 | |
| R11 Notificaties | verspreid (BO-10/32/44, INS-35) | |
