# Claude Code-prompt — B-105 afmaken (existence-oracle op id-routes)

> Volgende punt na de merge van PR #164. Plak alles onder de streep in Claude Code, vanuit de repo-root `InspeXi-Beheer`.

---

Je maakt bevinding **B-105** af. Die staat in `docs/testprogramma/bevindingen/B-105.md` als "opgelost", maar dat is te vroeg: WP-C1 haalde alle kale `new ForbiddenException()` weg (0 over) terwijl het onderliggende doel — geen existence-oracle op id-routes — nog niet gehaald is.

## Wat er nog staat

Zestien plekken doen nog `findUnique({ where: { id } })` gevolgd door een org-vergelijking met een **403**. Omdat een niet-bestaand record 404 geeft en andermans record 403, is het bestaan van andermans data af te leiden. Basis: `origin/dev` @ `b2a393e`.

| Bestand | Aantal |
|---|---|
| `apps/api/src/modules/documents/documents.service.ts` | 4 |
| `apps/api/src/modules/notes/notes.service.ts` | 4 |
| `apps/api/src/modules/tasks/tasks.service.ts` | 3 |
| `apps/api/src/modules/work-orders/work-orders.service.ts` | 3 |
| `apps/api/src/modules/support-tickets/support-tickets.service.ts` | 2 |

Vind ze met:
```bash
grep -rn "findUnique" apps/api/src/modules/{documents,notes,tasks,work-orders,support-tickets} -A6 | grep -B4 "ForbiddenException('Geen toegang"
```

## Wat je doet

Vervang per plek het patroon door de conventie die de 42 al geconverteerde modules gebruiken:

```ts
// was: findUnique({ where: { id } }) + if (found.orgId !== user.orgId) throw Forbidden
const doc = assertFound(
  await this.prisma.document.findFirst({ where: { id, ...orgScope(user), isDeleted: false } }),
  'Document',
);
```

Let op:
- `orgScope(user)` is de deprecated wrapper; gebruik **`orgScopeFor(user, tenant)`** als de service al een `TenantContext` heeft (WP-B3/D2-beslissing: het subdomein bepaalt de scope). Heeft hij die niet, gebruik dan `orgScope(user)` en laat het zo — sleep er geen tenant doorheen alleen hiervoor.
- `isDeleted: false` blijft **expliciet** per query; er is geen soft-delete-middleware.
- SUPERUSER moet blijven werken: `orgScope`/`orgScopeFor` regelen dat al.
- **Raak `assert-same-org.ts` niet aan.** FK-injectie in een request-body hoort 403 met NL-melding te blijven — dat is een ander scenario en gedraagt zich correct. Idem de vijf plekken in `organizations.controller.ts` en `support-access.service.ts`: dat zijn pure `user.orgId !== id`-vergelijkingen zonder DB-lookup, dus geen oracle.

## Tests

Breid de bestaande tabelgedreven suite uit die WP-C1 opleverde (zoek in `apps/api/test/` naar de cross-tenant/404-oracle-spec). Voeg voor elk van de vijf modules een paar toe: **id van een vreemde org** en **niet-bestaande UUID** moeten dezelfde status én byte-identieke body geven. Faalt de test zodra een van beide afwijkt.

## Afronden

1. `npx turbo run build` + de API-unit- en e2e-suite groen.
2. Werk `docs/testprogramma/bevindingen/B-105.md` bij: status van "opgelost" naar de feitelijke eindstand, met vermelding dat WP-C1 de kale exceptions deed en deze PR het restant.
3. Werk `docs/herstelplan/voortgang/restrisico.md` bij (haal het B-105-restpunt eruit) en de auditlijst in `docs/herstelplan/voortgang/AUDIT-onafhankelijk.md` §7 punt 2.
4. PR met de bevindings-ID, wat er veranderd is en hoe het geverifieerd is.

Branch: `fix/b105-existence-oracle-restant`.
