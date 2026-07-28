# Bevindingen — logformat & severity

Claude Code logt tijdens uitvoering. Aanbevolen structuur:
- `bevindingen/logboek.md` — chronologisch afvinken van **elk** testgeval (PASS/FAIL/BLOCKED/SKIP + 1 regel).
- `bevindingen/B-<nr>.md` — één bestand per échte bevinding (FAIL/afwijking), volgens onderstaand sjabloon.
- `bevindingen/SAMENVATTING.md` — tellingen + go/no-go-tabel uit `07-cross-tenant-security.md`.

Screenshots (via de browser-tool) opslaan onder `bevindingen/img/` en refereren.

---

## Sjabloon per bevinding

```markdown
# B-001 — <korte titel>

- **Testgeval:** BO-14
- **Actor / rol:** Backoffice / MANAGER
- **App:** Portal (:5173) · org: inspexidemo
- **Severity:** S3 (matig)
- **Type:** foutgok / grenswaarde
- **Datum/tijd:** 2026-07-18 14:22

## Verwacht
Negatieve unitPrice zou geweigerd of duidelijk gemarkeerd moeten worden.

## Werkelijk
Backend accepteert unitPrice = -100; offertetotaal wordt negatief zonder waarschuwing.

## Reproductie
1. Login manager@inspexi-demo.nl
2. Offerte X → editor → regel toevoegen
3. unitPrice = -100, aantal = 1 → opslaan
4. Totaal toont € -100,00

## Bewijs
- HTTP: PATCH /api/v1/quotes/:id/lines → 200 (verwacht eerder 400 of UI-block)
- Console: geen errors
- Screenshot: bevindingen/img/B-001.png

## Analyse / vermoedelijke oorzaak
`QuoteLineDto.unitPrice` heeft geen `@Min(0)` (DTO), UI-hint `min=0` is te omzeilen.

## Advies
`@Min(0)` op unitPrice, of expliciet negatieve regels toestaan als creditregel met UI-indicatie.
```

---

## Severity-definities

| Severity | Betekenis | Voorbeelden |
|---|---|---|
| **S1 Blokkerend** | Crash, dataverlies, security/isolatie-lek, autorisatie-omzeiling | 500 op geldige invoer, cross-tenant read slaagt, INSPECTEUR muteert CRM |
| **S2 Ernstig** | Gouden pad breekt of verkeerde businessuitkomst | Offerte versturen vanuit GEACCEPTEERD lukt, review-gate omzeilbaar, sync verliest findings |
| **S3 Matig** | Ontbrekende validatie zonder directe schade, of verwarrende UX | Negatieve prijs/korting >100% geaccepteerd, verleden datum toegestaan, Engelse foutmelding |
| **S4 Cosmetisch** | Visueel/tekstueel, geen functioneel effect | Ontbrekende `—`-fallback, typefout, afkap-glitch |

## Statuscodes-referentie (verwachte waarden bij negatieve tests)

| Situatie | Verwacht |
|---|---|
| Ongeldige DTO (validatie) | 400 |
| Niet geauthenticeerd | 401 |
| Geen rechten (rol) | 403 |
| Cross-tenant resource | **404** (bestaan niet onthullen) |
| Ongeldige statusovergang / business-gate | 400 |
| Beschikbaarheidsconflict planning | 409 (+ warnings) |
| First-wins herstel-verliezer | 409 |
| Dubbele unieke waarde (quoteNumber/nodeNumber/e-mail) | 400/409 (nette melding, geen 500) |
| Rate-limit overschreden | 429 (+ Retry-After) |
| AI-review zonder key | 503 |

## PASS-criteria (samengevat)
Een testgeval is **PASS** als: geen 500/witte pagina, verwachte statuscode, NL-foutmelding bij het juiste veld, data onveranderd na geblokkeerde actie, effect persisteert na refresh bij geslaagde actie, en injectie-strings veilig geëscaped tonen.
