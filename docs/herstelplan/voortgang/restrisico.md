# Restrisico — bewust niet (volledig) opgeloste bevindingen

> Per bevinding: reden (achterhaald / beslispunt / epic / mitigatie) en waar het vervolg belegd is.

| Bevinding | WP | Reden | Vervolg |
|---|---|---|---|
| B-402 (staf-berichten) | B9 | Alleen mitigatie — volledige stafzijde is Epic 1 | `03-beslispunten-backlog.md` §C Epic 1 |
| B-403 (staf-klantverzoeken) | B9 | Alleen mitigatie (e-mailnotificatie) — volledige wachtrij is Epic 2 | `03-beslispunten-backlog.md` §C Epic 2 |
| B-406 deel 2 (tekenrecht toekennen) | B9 | Alleen mitigatie (`canSign` doorgeven) — toekennen is Epic 3 | `03-beslispunten-backlog.md` §C Epic 3 |
| B-409 (anonimisering hersteller) | C2 | Wacht op beslispunt A4 | `03-beslispunten-backlog.md` §A A4 |
| B-220 (offline inloggen na uitloggen) | D3 | Wacht op beslispunt A5 | `03-beslispunten-backlog.md` §A A5 |
| B-209/B-223e (versieanker) | D1 | Wacht op beslispunt A1 | `03-beslispunten-backlog.md` §A A1 |
| B-205b (canonieke datavorm) | D2 | Wacht op beslispunt A2 | `03-beslispunten-backlog.md` §A A2 |
| B-223a (pull-scope inspecteur) | C3 | Wacht op beslispunt A3 | `03-beslispunten-backlog.md` §A A3 |
| B-402/B-403 (dead-end blijft) | B9 | Alleen mitigatie: klant wordt niet meer misleid + org krijgt e-mail; stafzijde = Epic 1/2 | `03-beslispunten-backlog.md` §C |
| B-315 (lines.0.-prefix) | B5 | Geneste DTO-fouten dragen ValidationPipe-prefix voor directe API-callers; ontprefixing hoort bij WP-C1 | WP-C1 (golf 3) |
| B-502 (nav-items) | B3 | Platform-brede superuser-schermen (error-reports, help-admin, ticketconsole) blijven benaderbaar op org-subdomeinen (roles-based); aanbeveling: nav verbergen/labelen | Follow-up klein |
| B-152 (apex-domein) | B7 | Gemailde offerte-links gebruiken een generiek `PUBLIC_URL`-host (DEP-6): tenantbinding op org-subdomeinen is dicht, apex bewust open — anders breken alle verzonden links | Eigenaarsbeslissing: PUBLIC_URL subdomein-bewust maken, daarna apex dichtzetten (één regel in `publicTenantWhere()`) |
| B-306 (nasleep) | B7 | Interne notities stonden al publiek achter mogelijk gedeelde tokens; tokenrotatie geadviseerd, niet uitgevoerd. Publieke planning-routes dragen nog een klasse-brede feature-gate met verkeerde-org-semantiek (follow-up) | PR #138-body |
| B-305 (nasleep) | B6 | Dropdowns cappen op 200: >200 records → stil afgekapt; ongebonden `limit` op /help/articles + /support-tickets (pre-existing) | Follow-up: server-side search/typeahead; losse kleine PR |
| B-507 (nasleep) | B4 | Overige uploadroutes (documents/photos/location-images/certificates, quote-templates serveert nog SVG authenticated) valideren op file.mimetype; helmet-CSP dempt platformbreed. Prod: SVG-logo-datacheck vóór uitrol | Vervolgtaak-chip aangemaakt door agent; pre-deploy-stap in PR #136 |
| syncedAt-skew (nieuw, uit A1) | — | Vals zelf-conflict bij elke re-edit; code gefixt in PR #144. **Pre-deploy prod: `scripts/backfill-synced-at-skew.ts` draaien** (aanvulling op de §8-datachecks) | PR #144 |
| B-211 (nasleep) | A1 | Auto-sync triggert alleen op reconnect/mount (online muteren vergt de sync-pill — bewuste scope); bottom-nav overlapt sheet-submit op desktop (pre-existing, cosmetica-kandidaat) | InspeXi PR #30-body |

_Deze tabel wordt per golf bijgewerkt; bevindingen die tijdens uitvoering achterhaald blijken komen hier ook te staan._
