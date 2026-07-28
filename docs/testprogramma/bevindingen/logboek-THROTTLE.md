# Logboek — throttling (fase 2c)

**Uitgevoerd met de API in normale env** (dus zónder `NODE_ENV=test`, throttling actief).
API herstart op :3001, alle metingen per-IP vanaf localhost. Datum: 2026-07-27.

| ID | Status | Opmerking |
|---|---|---|
| SEC-19 | PASS | `POST /auth/login` met foute inloggegevens: pogingen 1–9 geven 401, de 10e geeft **429** met `Retry-After: 60`. Limiet is 10/min (één request van een gelijktijdige probe telde mee), dus de grens ligt waar het script hem verwacht. Melding is Engels — zie B-601. |
| SEC-20a | PASS | `POST /client/repair/lookup`: pogingen 1–5 geven de generieke 404, de **6e geeft 429** met `Retry-After: 60`. Exact op de gedocumenteerde grens van 5/min. |
| SEC-20b | PASS | `POST /client/auth/magic-link`: pogingen 1–20 geven 400 (ongeldig token), de **21e geeft 429** met `Retry-After: 60`. Exact op de grens van 20/min. |
| SEC-21 | PASS | Onbestaande subdomeinen (`bestaatniet1..5.localhost`): de eerste 3 geven 404 `"Organisatie 'x' niet gevonden"`, de **4e geeft 429** met `Retry-After: 300` en de Nederlandse melding `"Te veel pogingen, probeer later opnieuw"`. De 5 minuten blokkade uit de enumeratieguard klopt. |
| PUB-15 | PASS | Identiek aan SEC-20a — 6e herstel-lookup binnen een minuut geeft 429. |

## Waarnemingen

1. **Geblokkeerde requests verlengen het venster niet.** Tijdens een blokkade telde `Retry-After` netjes af
   (28 → 13 → 0) terwijl er bleef worden aangeklopt. Er is dus geen straf-stapeling; na afloop van het
   venster is de route direct weer bruikbaar. Dat is gewenst gedrag (geen permanente lock-out door een
   bot), maar betekent ook dat een aanvaller met geduld gewoon kan doorgaan — de enumeratieguard met zijn
   5-minutenvenster is daarvoor de zwaardere maatregel.
2. **Twee verschillende meldingsstijlen** — zie bevinding **B-601**.
3. De limieten zijn **per IP en per route**, niet per account: het blokkeren van login-pogingen op één
   e-mailadres blokkeert dus alle logins vanaf dat IP. Voor een kantoor achter één NAT-adres kan dat
   betekenen dat één gebruiker met een vergeten wachtwoord zijn collega's buitensluit. Niet als bevinding
   gelogd (het is een bewuste ontwerpkeuze en het venster is kort), maar het is het vermelden waard.
