# Error Handling & Logging — Verbeterplan

Bevindingen uit de review van juni 2026. Stappen 1–5 zijn quick wins (één PR), 6–9 middelgroot, 10–11 voor productiegang.

## Status

- [ ] Stap 1–5 (PR: error handling quick wins)
- [ ] Stap 6–9
- [ ] Stap 10–11

## Stappen

### 1. Process-level handlers (API)
`main.ts`: registreer `process.on('unhandledRejection')` (loggen, niet crashen) en `process.on('uncaughtException')` (loggen + `process.exit(1)` zodat de procesmanager herstart). Zonder deze handlers kan één losse rejection uit een cron job of fire-and-forget promise het proces neerhalen.

### 2. Prisma-foutmapping in AllExceptionsFilter
`common/filters/http-exception.filter.ts`: herken `Prisma.PrismaClientKnownRequestError` en map:
- `P2002` (unique violation) → 409 Conflict, NL-melding ("Deze waarde bestaat al")
- `P2025` (record not found) → 404
- `P2003` (FK violation) → 400

Nu wordt elke Prisma-fout een generieke 500 — bijv. een dubbele `quoteNumber` per org. De bestaande P2002-retry in `work-orders.service.ts` (nummergeneratie) blijft staan; die vangt de fout vóór de filter.

### 3. ValidationPipe-details doorgeven
De filter pakt nu `message[0]` uit de class-validator array; overige veldfouten gaan verloren. Voeg bij array-messages een `errors: string[]` veld toe aan de response body naast de bestaande `message` (eerste fout). Frontend kan dan alle veldfouten tonen.

### 4. EmailService-conventie consistent maken
Eén expliciete regel, gedocumenteerd in `email.service.ts`:
- **Throwen** (gebruiker moet weten dat verzenden mislukte): `sendInvitation`, `sendQuoteEmail`, `sendContactEmail`
- **Alleen loggen** (background of anti-enumeration): `sendNotificationEmail`, `sendSignedQuoteEmail`, `sendQuoteAnswerEmail`, `sendPasswordReset` (bewust stil: een 500 alleen bij bestaande accounts zou e-mail-enumeratie mogelijk maken), `sendEmailVerification`

Bij `sendInvitation`-falen in `users.service.ts`: verwijder de zojuist aangemaakte invitation (anders blokkeert de ConflictException een retry) en gooi een nette fout.

### 5. Frontend: servermeldingen tonen i.p.v. generieke toasts
Nieuw: `getErrorMessage(err, fallback)` in `lib/api-client.ts` (of `lib/errors.ts`) die `ApiClientError.message` retourneert met fallback. Vervang alle `catch { showToast('… mislukt', 'error') }` door `catch (err) { showToast(getErrorMessage(err, '… mislukt'), 'error') }`. De backend stuurt al nette NL-meldingen (assertFound, FK-validatie, throttling) — die gaan nu verloren.

### 6. Request-ID middleware
Genereer per request een UUID (of neem `X-Request-Id` van de proxy over), stop hem in de bestaande `requestContext` (AsyncLocalStorage), zet hem in de response-header en in de 500-body. Frontend toont de code bij fouten → direct koppelbaar aan serverlogs en error-reports.

### 7. HTTP access-logging interceptor
Log method, path, status, duur, orgId, userId, requestId — minimaal voor 4xx/5xx. Maakt cross-tenant 403's en throttler 429's zichtbaar (nu logt de filter alléén 500's).

### 8. Audit-failure zichtbaarheid
Audit-writes falen nu stil (één logregel). Voeg een teller toe en dispatch een notificatie naar superusers (bestaand notificatiesysteem) bij structureel falen — compliance-gat.

### 9. Frontend: global unhandledrejection-handler
`window.addEventListener('unhandledrejection', …)` in `main.tsx` die (gedebounced/gededupliceerd) naar `POST /error-reports` rapporteert. De ErrorBoundary vangt alleen render-errors; async fouten verdwijnen nu geruisloos.

### 10. Structured JSON-logging (nestjs-pino)
Vervang de default logger door `nestjs-pino`: JSON-output, automatische request-logging, requestId-binding. De `Logger`-API in de 39 services blijft gelijk. Grootste enkele upgrade; pas relevant richting productie met log-aggregatie.

### 11. Error-reports aggregatie + correlatie
Dedupliceer reports op hash van message+stack, sla het requestId (stap 6) mee op zodat frontend- en backendfouten correleerbaar zijn. Alternatief: Sentry/GlitchTip, maar de eigen module dekt het basisscenario.

## Bewust niet doen
- Geen Prisma-middleware voor soft-deletes/errors (zie CLAUDE.md)
- Geen mutation-retries in TanStack Query (niet-idempotente POSTs)
- Geen try/catch per service — de globale filter blijft het patroon
