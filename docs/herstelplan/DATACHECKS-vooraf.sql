-- ============================================================================
-- Pre-deploy datachecks — VOORAF draaien op productie (read-only)
-- ============================================================================
-- Alle queries hieronder zijn SELECT-only en veilig op een draaiende productie.
-- Doel: vóór het onderhoudsvenster weten of er handwerk ligt, in plaats van
-- er tijdens de deploy achter te komen.
--
-- Draai dit als één blok; elke check geeft een eigen resultaatset met label.
-- Bij nul rijen kun je de betreffende runbook-stap straks in seconden afvinken.
--
-- Bron: RUNBOOK-DEPLOY.md stap 3. Twee checks zijn BLOKKEREND (3a en 3c):
-- daar moet het handwerk af zijn vóórdat de nieuwe API-image live gaat.
-- ============================================================================


-- ─── 3a. BLOKKEREND — SVG-logo's (B-507 / WP-B4) ────────────────────────────
-- De nieuwe upload-whitelist laat alleen PNG/JPEG/WebP toe en serveert bestaande
-- SVG's bewust als application/octet-stream. Treffers = gebroken logo tot ze
-- geconverteerd en opnieuw geüpload zijn. Doe dat VÓÓR de image-uitrol.

SELECT '3a-logo' AS check, id, slug, logo_url
FROM imp_organizations
WHERE logo_url ILIKE '%.svg';

-- Zelfde risico op avatars (niet in het runbook, wel dezelfde uploadketen):
SELECT '3a-avatar' AS check, id, email, avatar_url
FROM imp_users
WHERE avatar_url ILIKE '%.svg';


-- ─── 3b. Ongewilde goedkeuringsdrempel 0 (B-508 / WP-C5) ────────────────────
-- De oude zod-bug maakte van een leeg drempelveld stilzwijgend 0 → élke offerte
-- vereist dan goedkeuring. 0 kan ook een bewuste keuze zijn: per org beoordelen.
-- Niet blokkerend voor de deploy, wel voor het vertrouwen van die org.

SELECT '3b-threshold' AS check, id, slug, quote_approval_threshold, quote_approval_required_role
FROM imp_organizations
WHERE quote_approval_threshold = 0;


-- ─── 3c. BLOKKEREND — gereserveerde/ongeldige slugs (B-505 / WP-C5) ─────────
-- De nieuwe reserved-check blokkeert élke update mét slug van zo'n org. Bestaat
-- er een botsing, dan is een handmatige slug-migratie nodig vóór deze release.

SELECT '3c-slug' AS check, id, slug, name, is_active
FROM imp_organizations
WHERE slug IN (
        'mijn','www','api','app','admin','portal','static','assets','cdn','status',
        'docs','help','support','mail','smtp','imap','pop','mx','webmail',
        'ns','ns1','ns2','dns','vpn','ftp','localhost'
      )
   OR length(slug) > 63
   OR length(slug) < 2;


-- ─── 3d. Aanbevolen — typedefinities zonder shortCode (B-203) ───────────────
-- Zonder shortCode levert de nummering-engine nodenummers als "-0033".
-- Niet blokkerend, wel rommelig in het veld.

SELECT '3d-assettype' AS check, id, org_id, code, name
FROM imp_asset_type_definitions
WHERE short_code IS NULL OR btrim(short_code) = '';

SELECT '3d-locationtype' AS check, id, org_id, code, name
FROM imp_location_type_definitions
WHERE short_code IS NULL OR btrim(short_code) = '';

-- Bestaan er al nodenummers met een lege typecode-prefix?
SELECT '3d-nodenumber' AS check, id, org_id, node_number, node_type
FROM imp_asset_nodes
WHERE node_number LIKE '-%'
LIMIT 50;


-- ─── Extra: omvang van het D1-backfillwerk inschatten ───────────────────────
-- Deze twee zeggen hoeveel werk de migratie + het handmatige skew-script doen.
-- Puur informatief: groot aantal = langere migratieduur, plan je venster erop.
-- (Draai dit VÓÓR de migratie; erna horen beide 0 te zijn — zie runbook 7b.)

SELECT 'D1-null-anker' AS check, 'imp_inspection_plans' AS tabel, count(*) AS rijen
FROM imp_inspection_plans WHERE synced_at IS NULL
UNION ALL SELECT 'D1-null-anker', 'imp_asset_nodes', count(*) FROM imp_asset_nodes WHERE synced_at IS NULL
UNION ALL SELECT 'D1-null-anker', 'imp_findings', count(*) FROM imp_findings WHERE synced_at IS NULL
UNION ALL SELECT 'D1-null-anker', 'imp_visual_inspections', count(*) FROM imp_visual_inspections WHERE synced_at IS NULL
UNION ALL SELECT 'D1-null-anker', 'imp_measurement_records', count(*) FROM imp_measurement_records WHERE synced_at IS NULL
UNION ALL SELECT 'D1-null-anker', 'imp_measurement_sheet_records', count(*) FROM imp_measurement_sheet_records WHERE synced_at IS NULL
UNION ALL SELECT 'D1-null-anker', 'imp_standalone_measurements', count(*) FROM imp_standalone_measurements WHERE synced_at IS NULL;

-- Nulmeting voor de D2-datamigratie: hoeveel records dragen nog de legacy-vorm
-- {sections:{…}}? Ná de migratie moet dit 0 zijn (runbook 7a).
SELECT 'D2-legacy-vorm' AS check, count(*) AS rijen
FROM imp_measurement_sheet_records
WHERE jsonb_typeof(data->'sections') = 'object';


-- ============================================================================
-- Noteer de uitkomsten in docs/herstelplan/voortgang/logboek.md, met datum.
-- Nul rijen op 3a en 3c betekent: die runbook-stappen zijn straks een formaliteit.
-- ============================================================================
