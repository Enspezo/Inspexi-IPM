# Testlogboek SEC-B — cross-tenant, sessies & tokens (SEC-10 t/m SEC-18)

Uitvoering: 2026-07-27, API `http://localhost:3001/api/v1` (`NODE_ENV=test`, throttle uit).
Tenants via `Host`-header: org A = `inspexidemo.localhost`, org B = `testbedrijf.localhost`
(aanvullend gebruikt: `inspexicompleet`, `inspexibasis`, `inspeximix`, `mijn`).
Alle uitspraken hieronder komen uit daadwerkelijk uitgevoerde HTTP-calls; DB-verificatie via psql op :5433.

Formaat: `ID | PASS/FAIL/BLOCKED/SKIP | opmerking`

---

| ID | Status | Opmerking |
|---|---|---|
| SEC-10 | PASS | Client-realm is strikt org-gescoped: `orgId` komt uit het subdomein, nooit uit het token. Eigen plan → 200; org B-plan (`7b9348c5`, Test Bedrijf) → 403 op host A én host B; eigen plan op host B → 403; `GET /client/inspections` op host B → `data: []`. **Geen enumeratie-oracle**: een niet-bestaande UUID geeft exact hetzelfde 403 als een bestaand-maar-vreemd plan. Afwijking: statuscode is **403 "Geen toegang tot deze inspectie"** waar het testscript **404** voorschrijft → **B-151** (S4, geen lek). |
| SEC-11 | **FAIL** | **Publieke offerte-token is NIET aan het subdomein gebonden.** `GET /public/quotes/tp-offerte-geaccepteerd` (org A) geeft 200 met de volledige org A-offerte incl. `organization`-branding en contact-e-mailadres op `inspexicompleet.localhost` én `mijn.localhost`. `POST /public/quotes/:token/sign` slaagt óók vanaf een vreemd subdomein (getest op wegwerp-offerte SECTEST-0003: status VERSTUURD → GEACCEPTEERD, project auto-aangemaakt in org A). Op `testbedrijf`/`inspexibasis` → 403 `FEATURE_NOT_IN_PLAN`, d.w.z. de entitlement-gate wordt tegen de **bezoekende** tenant geëvalueerd i.p.v. de eigenaar-org. Gemanipuleerd token → 404 "Offerte niet gevonden" (correct); CONCEPT-offerte → 403 "Offerte is nog niet verstuurd" (correct). → **B-152** (S2) |
| SEC-12 | PASS | INSPECTEUR org A: `GET /inspection-plans/<orgB-plan>` → 404 "Inspectieplan niet gevonden" (getest op alle 4 vreemde plannen incl. `7b9348c5` van Test Bedrijf); org A-token op host B → 403 "U heeft geen toegang tot deze organisatie". `GET /sync/pull?since=1970-01-01T00:00:00.000Z` → 17 kB payload met **uitsluitend** `orgId` `f765ff41…` (org A); 0 hits op alle 4 vreemde plan-id's en alle 4 vreemde org-id's. `POST /sync/push` update/delete op vreemd plan → per-change `status:"failed"`, `"Record niet gevonden"`, `processed.inspectionPlans = 0`; create met vreemde `orgId` → `"Relatie hoort niet bij uw organisatie"`; finding op vreemd plan → `"Inspectie hoort niet bij uw organisatie"`; `POST /sync/resolve` → `"Geen conflict gevonden"`. **DB-verificatie na afloop: alle 4 vreemde plannen ongewijzigd** (`updated_at` nog 2026-07-17, `status` nog `draft`, `deleted_at` NULL) en geen enkel geïnjecteerd record aangemaakt. |
| SEC-13 | PASS | **10 negatieve lookup-varianten byte-voor-byte identiek** (md5 `ab63f725…`, 137 bytes, HTTP 404, "Deze combinatie is niet gevonden of online herstel is niet beschikbaar voor deze inspectie"): juist nr + foute postcode (RAP-2026-001 en RAP-TEST-100), onbestaand nummer, org A-nummer op host B, org B-nummer (TB-RAP-001) op host A, plan met `onlineRepairEnabled=false` (TP-RAP-001), en orgs zónder `ONLINE_HERSTEL`-entitlement (`inspexicompleet`, `testbedrijf`). Responseheaders eveneens identiek op `X-Request-Id`/`Date` na. Geen `@RequiresFeature` op de lookup → geen entitlement-oracle. Positieve controle (RAP-2026-001 + `1234 AB`) → 201 met sessietoken. |
| SEC-14 | PASS | Geknoeid token (laatste teken gewijzigd), onzin-token, leeg Bearer en een **zelf-gemint verlopen token** (HS256 met `JWT_SECRET`, `exp` 30 min in het verleden) → alle 401 op `GET /auth/me`. `POST /auth/refresh` mét cookie → 200 + nieuw accessToken; **rotatie werkt**: het oude refresh-token daarna → 401 "Ongeldige of verlopen refresh token". Refresh-cookie van org A op `testbedrijf.localhost` → 401 "Uw account hoort niet bij deze organisatie". Afwijking: **refresh zónder cookie geeft HTTP 200** met `{"success":false,"message":"Geen refresh token"}` i.p.v. 401 → **B-153** (S3). |
| SEC-15 | PASS | `backoffice@inspexi-demo.nl` ingelogd, token bewaard, user gedeactiveerd via `PATCH /users/:id/deactivate` (ORG_ADMIN, 200 "Gebruiker gedeactiveerd"). Oude, nog niet verlopen access-token daarna → **401** op `/auth/me` én `/contacts` ("User not found or inactive"); opnieuw inloggen → 401 "Account is gedeactiveerd". **Opgeruimd**: user geheractiveerd (`PATCH /users/:id/activate` → 200) en login met `Password123!` geverifieerd → 200; `is_active = t` in de DB. |
| SEC-16 | PASS | Reset-token zelf gemint met `JWT_SECRET` (`{sub, email, purpose:'password-reset', pwStamp:null}`) voor `werkvoorbereider@inspexi-demo.nl` (`passwordChangedAt` was NULL). 1e gebruik → 200 "Wachtwoord is gereset"; 2e gebruik met hetzelfde token → **400 "Ongeldige of verlopen reset token"** (pwStamp wijkt af = single-use). Login met het nieuwe wachtwoord → 200. Reset-token als Bearer op `/auth/me` → **401 "Ongeldig token-type"**. **Opgeruimd**: `password_hash` + `password_changed_at` via SQL teruggezet naar de seed-waarden en login met `Password123!` geverifieerd → 200. |
| SEC-17 | PASS | Clienttoken op staf-realm (`/contacts`, `/auth/me`, `/inspection-plans`, `/sync/pull`) → 4× 401. Staftoken (ORG_ADMIN) op client-realm (`/client/inspections`, `/client/auth/me`, `/client/requests`) → 3× 401. Wederzijdse afwijzing volledig. |
| SEC-18 | **FAIL** | TTL-gedrag zelf is correct: `demo-herstel-sessie` (COMPLETED, `expiresAt` 2026-07-11) → `GET /client/repair/session` **200** (COMPLETED blijft leesbaar); mutatie `POST /client/repair/findings/:id/resolve` → **400 "Deze herstelsessie is al afgerond"**; dezelfde sessie op `inspexicompleet.localhost` → **401 "Ongeldige herstelsessie"** (op `testbedrijf` komt eerst 403 `FEATURE_NOT_IN_PLAN` omdat de FeatureGuard vóór de RepairSessionGuard draait — geen lek). **Lazy expiry geverifieerd**: via een echte lookup een ACTIVE-sessie gemaakt, `expires_at` in de DB op `NOW() - 1h` gezet → volgende call **401 "Uw sessie is verlopen — log opnieuw in met rapportnummer en postcode."** en de DB-status stond daarna op **EXPIRED**. **Reden FAIL:** `GET /client/repair/declaration/pdf` geeft **HTTP 500** wanneer het opgeslagen PDF-bestand ontbreekt (zelfde bij `GET /client/repair/photos/:id`) → **B-154** (S3). Met een sessie waarvan het bestand wél op schijf staat (`tp-herstel-afgerond`) geeft hetzelfde endpoint 200 + `%PDF-1.4`. |

**Telling:** 7 PASS · 2 FAIL · 0 BLOCKED · 0 SKIP.
**Bevindingen:** B-151 (S4) · B-152 (S2) · B-153 (S3) · B-154 (S3) · B-155 (S4).

---

## Afwijkingen van het script (bewust, gelogd)

1. **SEC-10/SEC-12 — vervangende "org B"**: bij aanvang had `testbedrijf` géén inspectieplan (zie `lib/fixtures.env`). De eerste ronde is daarom uitgevoerd met de plannen van `inspexicompleet`, `inspexibasis` en `inspeximix` als vreemde org. Toen `seed-testprogramma` halverwege de run alsnog `TB-RAP-001` (`7b9348c5-…`) in Test Bedrijf aanmaakte, zijn SEC-10 en SEC-12 **opnieuw uitgevoerd tegen dat echte org B-plan** met identieke uitkomst.
2. **SEC-11 — eigen fixtures**: er was bij aanvang geen enkele offerte met een `publicToken`. Drie wegwerp-offertes (`SECTEST-0001` VERSTUURD, `SECTEST-0002` CONCEPT, `SECTEST-0003` VERSTUURD) zijn via SQL toegevoegd; de destructieve test (cross-host ondertekenen) is uitsluitend op `SECTEST-0003` gedaan. Na afloop is de bevinding **herbevestigd op de seed-fixture `tp-offerte-geaccepteerd`** (read-only, `viewedAt` stond al gezet → geen zij-effect). Alle SECTEST-records zijn verwijderd.
3. **SEC-13 — `RAP-TEST-100`**: bestond bij aanvang niet; is halverwege door de testprogramma-seed toegevoegd en daarna alsnog meegenomen (variant f). De org zonder `ONLINE_HERSTEL` is `inspexicompleet` resp. `testbedrijf`.
4. **SEC-16 — wegwerp-account**: er is geen API-route om een user direct aan te maken (alleen `POST /users/invite`), daarom is `werkvoorbereider@inspexi-demo.nl` gebruikt en daarna via SQL exact hersteld (hash + `password_changed_at = NULL`), met login-verificatie. Neveneffect (geaccepteerd): de refresh-tokens van die user zijn ingetrokken door `resetPassword`.
5. **SEC-18 — extra endpoint**: naast `declaration/pdf` is ook `GET /client/repair/photos/:id` geprobeerd om te bepalen of de 500 endpoint-specifiek of storage-breed is (bleek storage-breed).
6. **Gedeelde database**: tijdens deze run draaide een tweede agent die `seed-testprogramma` uitvoerde. Alle vóór/na-verificaties zijn daarom op specifieke record-id's gedaan in plaats van op tellingen.

## Opruimen (uitgevoerd en geverifieerd)

| Artefact | Actie | Verificatie |
|---|---|---|
| `SECTEST-0001/0002/0003` offertes | verwijderd | `SELECT count(*) … LIKE 'SECTEST-%'` → 0 |
| Project `P-2026-0003` (auto-aangemaakt door cross-host ondertekenen) | verwijderd incl. fasen | 0 rijen |
| 4 notificaties (`OFFERTE_BEKEKEN`/`OFFERTE_ONDERTEKEND` voor SECTEST) | verwijderd | 0 rijen |
| Eigen herstelsessie `8d3e0094-…` (SEC-13/18) | verwijderd | 0 rijen |
| `backoffice@inspexi-demo.nl` | geheractiveerd | `is_active = t` + login 200 |
| `werkvoorbereider@inspexi-demo.nl` | wachtwoord hersteld | hash = seed-hash, `password_changed_at = NULL`, login met `Password123!` → 200 |
| Vreemde inspectieplannen (SEC-12) | niet gemuteerd | `updated_at`/`status`/`deleted_at` ongewijzigd |

Niet aangeraakt: alle `TP-*`-fixtures en herstelsessies van de parallel draaiende agent.
