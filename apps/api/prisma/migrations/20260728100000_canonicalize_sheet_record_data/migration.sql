-- WP-D2 (B-205 deel 2, besluit A2): canonicaliseer MeasurementSheetRecord.data.
--
-- De server/portal-vorm is canoniek:
--   { [sectionCode]: { [rijnummer]: { [fieldCode]: { value, passFail } } }, __…metadata }
-- De PWA schreef historisch { sections: { [code]: { rows: [ {veld: waarde} ] }
-- | { values: {veld: waarde} } } } — en ná de WP-B1-crashguard bestond ook de
-- gemengde vorm { …serverkeys, sections: { … } }.
--
-- Deze pure datamigratie pakt de 'sections'-wrapper uit naar de canonieke vorm:
--   - rows[i]            → rij-sleutel i::text ("0", "1", …), dicht hernummerd;
--   - values             → rij "0";
--   - platte veldwaarde  → { value: <waarde>, passFail: null } (de legacy-vorm
--     droeg nooit een pass/fail-uitkomst; die wordt bij de eerstvolgende
--     bewerking door de evaluatie opnieuw gezet);
--   - een veld dat al een { value… }-object is blijft ongemoeid;
--   - bij de gemengde vorm wint de sections-inhoud per sectie (dat is de
--     recentste invoer van de inspecteur; de top-level serverkeys van andere
--     secties blijven staan);
--   - overige top-level sleutels (andere secties, __usedInstrumentsSnapshot)
--     blijven ongemoeid.
--
-- BEWUST: updated_at/synced_at worden NIET aangeraakt — anders zou elk
-- gemigreerd record bij de eerstvolgende PWA-push een vals v4-versieanker-
-- conflict geven (baseVersion ≠ updatedAt).
--
-- Idempotent: de WHERE-clausule matcht alleen rijen die de wrapper nog dragen;
-- na conversie bestaat de 'sections'-sleutel niet meer.
--
-- Naast de records zelf worden ook openstaande sync-conflicten
-- (imp_sync_queue, status 'conflict') voor measurementSheetRecord geconverteerd:
-- het /sync/resolve-pad past die bewaarde payloads via hetzelfde (nu strikte)
-- schema toe, dus een legacy-vormige payload zou anders onoplosbaar worden.

-- Helper: één rij (platte veld→waarde-map) → canonieke veld→{value,passFail}-map.
CREATE OR REPLACE FUNCTION __wp_d2_wrap_row(row_in jsonb) RETURNS jsonb AS $$
DECLARE
  out_row jsonb := '{}'::jsonb;
  f record;
BEGIN
  IF row_in IS NULL OR jsonb_typeof(row_in) <> 'object' THEN
    RETURN '{}'::jsonb;
  END IF;
  FOR f IN SELECT key, value FROM jsonb_each(row_in) LOOP
    IF jsonb_typeof(f.value) = 'object' AND f.value ? 'value' THEN
      -- Al canoniek leaf-object: ongemoeid laten.
      out_row := out_row || jsonb_build_object(f.key, f.value);
    ELSE
      out_row := out_row || jsonb_build_object(
        f.key,
        jsonb_build_object('value', f.value, 'passFail', NULL)
      );
    END IF;
  END LOOP;
  RETURN out_row;
END $$ LANGUAGE plpgsql;

-- Helper: volledige data-payload met 'sections'-wrapper → canonieke vorm.
-- Payloads zonder wrapper worden ongewijzigd geretourneerd.
CREATE OR REPLACE FUNCTION __wp_d2_canonicalize(data_in jsonb) RETURNS jsonb AS $$
DECLARE
  result jsonb;
  s record;
  converted jsonb;
  row_elem jsonb;
  idx int;
BEGIN
  IF data_in IS NULL OR jsonb_typeof(data_in) <> 'object'
     OR jsonb_typeof(data_in->'sections') IS DISTINCT FROM 'object' THEN
    RETURN data_in;
  END IF;

  result := data_in - 'sections';

  FOR s IN SELECT key, value FROM jsonb_each(data_in->'sections') LOOP
    IF jsonb_typeof(s.value) = 'object'
       AND jsonb_typeof(s.value->'rows') = 'array' THEN
      -- Herhalende sectie: rows-array → dicht hernummerde rij-sleutels.
      converted := '{}'::jsonb;
      idx := 0;
      FOR row_elem IN SELECT value FROM jsonb_array_elements(s.value->'rows') LOOP
        IF jsonb_typeof(row_elem) = 'object' THEN
          converted := converted
            || jsonb_build_object(idx::text, __wp_d2_wrap_row(row_elem));
          idx := idx + 1;
        END IF;
      END LOOP;
      result := result || jsonb_build_object(s.key, converted);
    ELSIF jsonb_typeof(s.value) = 'object'
          AND jsonb_typeof(s.value->'values') = 'object' THEN
      -- Niet-herhalende sectie: values → rij "0".
      result := result || jsonb_build_object(
        s.key,
        jsonb_build_object('0', __wp_d2_wrap_row(s.value->'values'))
      );
    ELSE
      -- Onbekende sectievorm: defensief ongewijzigd overnemen.
      result := result || jsonb_build_object(s.key, s.value);
    END IF;
  END LOOP;

  RETURN result;
END $$ LANGUAGE plpgsql;

-- 1. De records zelf.
UPDATE "imp_measurement_sheet_records"
SET "data" = __wp_d2_canonicalize("data")
WHERE jsonb_typeof("data"->'sections') = 'object';

-- 2. Openstaande sync-conflicten: de bewaarde client-payload…
UPDATE "imp_sync_queue"
SET "payload" = jsonb_set("payload", '{data}', __wp_d2_canonicalize("payload"->'data'))
WHERE "entity_type" = 'measurementSheetRecord'
  AND "status" = 'conflict'
  AND jsonb_typeof("payload"->'data'->'sections') = 'object';

-- …en de bewaarde serverstaat in conflict_data.
UPDATE "imp_sync_queue"
SET "conflict_data" = jsonb_set(
  "conflict_data",
  '{serverData,data}',
  __wp_d2_canonicalize("conflict_data"->'serverData'->'data')
)
WHERE "entity_type" = 'measurementSheetRecord'
  AND "status" = 'conflict'
  AND jsonb_typeof("conflict_data"->'serverData'->'data'->'sections') = 'object';

DROP FUNCTION __wp_d2_canonicalize(jsonb);
DROP FUNCTION __wp_d2_wrap_row(jsonb);
