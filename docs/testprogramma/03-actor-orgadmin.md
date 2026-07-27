# Actor: ORG_ADMIN — testscript (OA-xx)

**Login:** `http://inspexidemo.localhost:5173` · `admin@inspexi-demo.nl` / `Password123!`
**Rechten:** organisatie-instellingen, gebruikersbeheer, inspectie-config (per org), producten/templates.
**Risicogebieden:** R10 (onboarding/uitnodigingen), R5 (autorisatie), R6 (validatie), feature-gating.

---

## Organisatie-instellingen

| ID | T | Stap / invoer | Verwacht (orakel) |
|---|---|---|---|
| OA-01 | G | Instellingen → wijzig bedrijfsnaam, kleur, VAT 21→9, geldigheid 30→14 · opslaan · herlaad | Persistent; portal-thema-kleur verandert |
| OA-02 | G | Logo uploaden (PNG < 5 MB) | Zichtbaar in header/documenten |
| OA-03 | B | Logo van precies ~5 MB en > 5 MB | ≤5 MB lukt; >5 MB nette "te groot"-melding |
| OA-04 | F | Logo als `.txt`/`.pdf` (verkeerd type) | Geweigerd, geen crash |
| OA-05 | B | `quoteApprovalThreshold` = 0 · daarna = leeg/null | 0 = elke offerte vereist goedkeuring; null = geen drempel — beide consistent |
| OA-06 | B | `aiReviewInstructions` = 2001 tekens | Geweigerd (`@MaxLength(2000)`) |
| OA-07 | G | Toggles: `inspectionReviewEnabled`, `aiReviewEnabled`, `onlineRepairDefault`, `chatEnabled` aan/uit | Opgeslagen; effect zichtbaar (bv. review-gate, herstel-optie) |
| OA-08 | A | `aiReviewEnabled` aanzetten zónder `AI_REVIEW`-entitlement | Feature niet actief / nette melding (geen valse belofte) |

## Gebruikersbeheer & uitnodigingen

| ID | T | Stap | Verwacht |
|---|---|---|---|
| OA-09 | G | Gebruikers → uitnodigen: e-mail + rol INSPECTEUR · verstuur | Invitation aangemaakt, e-mail getriggerd (verifieer via API-respons/notificatie) |
| OA-10 | G | Accepteer de uitnodiging via `/invite/:token` (nieuwe browsercontext) · stel wachtwoord in | Nieuwe user actief met juiste rol |
| OA-11 | B | Wachtwoord bij accepteren = 7 tekens | Backend weigert (`@MinLength(8)`) — let op: portal-form kan korter doorlaten → 400 verwacht, nette melding |
| OA-12 | F | Uitnodigen met bestaand e-mail (bv. `manager@inspexi-demo.nl`) | Nette melding (e-mail globaal uniek), geen 500 |
| OA-13 | F | Uitnodigen met e-mail van een **andere org** (`admin@testbedrijf.nl`) | Geweigerd (globaal uniek) — documenteer melding |
| OA-14 | F | Uitnodiging accepteren met verlopen token (>7 dagen — simuleer via oude token of DB) | Nette "verlopen"-melding |
| OA-15 | F | Uitnodiging-token 2× gebruiken | Tweede keer geweigerd |
| OA-16 | A | Rollen wijzigen: probeer lege rollenlijst | Geweigerd (`@ArrayMinSize(1)`) |
| OA-17 | G | Gebruiker deactiveren → die user probeert in te loggen | 401 "Account is gedeactiveerd" |
| OA-18 | A | Probeer als ORG_ADMIN een SUPERUSER-route (`/organizations`, `/classification-models`) | 403/geen toegang (zie SEC) |

## Inspectie-config (per org)

| ID | T | Stap | Verwacht |
|---|---|---|---|
| OA-19 | G | Asset-types → nieuw type met velden (tekst + nummer met min/max) + shortCode (typecode) | Opgeslagen; typecode voedt nodeNumber-prefix `[typecode]-####` |
| OA-20 | G | Checklists → nieuwe checklist (ACTIEF) met OK/NOK/NVT-items, gekoppeld aan normtype | Beschikbaar voor PWA-sync |
| OA-21 | G | Constatering-template met classificatie + normreferentie + aanbeveling | Opgeslagen, herbruikbaar in PWA-finding |
| OA-22 | F | Checklist met 0 items publiceren / template zonder naam | Geweigerd of duidelijke waarschuwing |

**Cross-check:** wijzigingen in inspectie-config moeten via de PWA-referencecaches doorkomen (zie INS-04).
