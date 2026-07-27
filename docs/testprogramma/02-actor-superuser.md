# Actor: SUPERUSER — testscript (SU-xx)

**Login:** `http://mijn.localhost:5173` · `superuser@inspexi.nl` / `Password123!`
**Rechten:** platform-breed (org-overstijgend), org-switcher, inspectie-systeem (globaal).
**Risicogebieden:** R10 (onboarding), R1 (isolatie — superuser mág alles, verifieer dat gewone rollen dat níet kunnen — zie SEC).

Legenda kolom **T**: G=gouden pad, B=grenswaarde, F=foutgok/"domme gebruiker", A=autorisatie/procesflow.

---

## Onboarding: organisatie aanmaken

| ID | T | Stap / invoer | Verwacht (orakel) |
|---|---|---|---|
| SU-01 | G | Organisaties → Nieuw · naam "Nieuwe Klant BV", slug `nieuweklant`, kleur, VAT 21, geldigheid 30 | Org aangemaakt, verschijnt in lijst, subdomein `nieuweklant.localhost:5173` bereikbaar (login-scherm) |
| SU-02 | B | Slug van 1 teken `a` | Toegestaan? Regex staat het toe (`^[a-z0-9]+$`). Verifieer of dat wenselijk is; log als S4 indien te kort geaccepteerd |
| SU-03 | F | Slug met streepje `nieuwe-klant` | Frontend-zod + backend-regex weigeren → nette veldfout, geen submit |
| SU-04 | F | Slug met hoofdletters `NieuweKlant` / spatie / emoji | Geweigerd met NL-melding |
| SU-05 | F | Naam leeg of 1 teken | Geweigerd (`min 2`) |
| SU-06 | F | Dubbele slug (`inspexidemo` opnieuw) | Uniek-conflict, nette melding (geen 500) |
| SU-07 | B | VAT = -5 / 150 · geldigheid = 0 | Geweigerd (VAT 0–100, validity ≥1) |
| SU-08 | F | logoUrl = `niet-een-url` | Frontend eist geldige URL (`z.url()`); backend niet — documenteer laagverschil |
| SU-09 | F | Naam met `<script>`/emoji/CJK (`randorg`-variant) | Aangemaakt, overal veilig geëscaped weergegeven |

## Abonnement / entitlements

| ID | T | Stap | Verwacht |
|---|---|---|---|
| SU-10 | G | Ken plan "Compleet" toe aan de nieuwe org; controleer dat de portal-sidebar van die org de compleet-features toont | Feature-gating klopt: CRM_COMPLEET/UITVOERING/INSPECTIES zichtbaar |
| SU-11 | G | Zet org op "Basis" → log in als die org-admin | Alleen basis-menu's; compleet-routes geven feature-gate (geen crash) |
| SU-12 | A | Org op inactief zetten (`isActive=false`) → benader subdomein | Middleware geeft 404 (offboarding); geen data zichtbaar |

## Org-switcher & isolatie

| ID | T | Stap | Verwacht |
|---|---|---|---|
| SU-13 | G | Org-switcher → spring naar `testbedrijf` | Full-page redirect naar `testbedrijf.localhost:5173`, data van testbedrijf zichtbaar |
| SU-14 | A | Als SUPERUSER data van 2 orgs naast elkaar bekijken | Correcte scoping per subdomein; geen vermenging |

## Inspectie-systeem (globaal, SUPERUSER-only)

| ID | T | Stap | Verwacht |
|---|---|---|---|
| SU-15 | G | Classificatiemodellen → nieuw model + kenmerk + opties, markeer één optie `isCritical` | Opgeslagen; beschikbaar in constateringen van álle orgs |
| SU-16 | G | Normtypes → nieuw normtype + configuratie | Opgeslagen, koppelbaar aan checklists/templates |
| SU-17 | G | Meetstaat-template → form-builder: sectie + numeriek veld met min 0 / max 100 / decimals 2 + pass/fail-regel | Opgeslagen; laadt straks in de PWA-meetstaat |
| SU-18 | F | Meetstaat-veld met max < min (bv. min 100, max 0) | Builder weigert of waarschuwt; geen onbruikbaar template |

**Autorisatie-controle (kruisverwijzing SEC):** verifieer dat `/classification-models`, `/norm-types`, `/measurement-sheet-templates`, `/organizations`, `/plans` **niet** benaderbaar zijn voor ORG_ADMIN of lager (zie SEC-01..05).
