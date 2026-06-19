# PWA fixup — Fase 3 typecheck (alleen de door v2 geraakte plekken)

De PWA `tsc --noEmit` is rood. Het meeste is **pre-existing schuld** (documents/*-feature = Fase 4-terrein, `PhotoViewer` foto-annotaties, ongebruikte imports) en valt buiten Fase 3. Deze prompt fixt alleen wat de v2-rename (Fase 3) heeft geraakt, zodat ons werk geen regressie achterlaat.

## Prompt (Claude Code, in de Inspexi-App-repo)

```
Doel: maak de door de v2-sync-rename geraakte TypeScript-fouten groen. Raak de pre-existing
schuld (components/documents/*, PhotoViewer, losse ongebruikte imports elders) NIET aan —
die hoort bij Fase 4 / een aparte opschoon-PR.

Fix 1 — asset-statuskaart (statusCode is nu een vrije lookup-code, niet meer 3 enums):
- Bestanden: src/features/inspection-plan/AssetTree.tsx en LocationAssetTree.tsx
- statusConfig is nu Record over {new,in_progress,completed} maar wordt geïndexeerd met
  asset.statusCode (systeemcodes incl. 'rejected' en 'not_applicable', plus mogelijke
  org-eigen codes). Maak statusConfig `Record<string, {...}>`, voeg entries toe voor
  'rejected' en 'not_applicable', en gebruik een veilige fallback:
    const config = statusConfig[asset.statusCode ?? 'new'] ?? statusConfig.new;
  Zo crasht een org-eigen statuscode de boom niet.

Fix 2 — handtekening-aanmaak (v2 Signature-shape):
- Bestand: src/features/inspection-completion/CompleteInspectionPage.tsx (handleSignatureSave)
- `data.signatoryFunction` bestaat niet op het callback-object (dat heeft `signatoryRole`).
  Map naar het juiste veld (signatoryRole → signatoryFunction), of haal het uit de juiste bron.
- createSignature() verwacht nu createdAt/updatedAt (SyncableEntity). Zet die in de
  createSignature-helper (services), niet in elke call. Lijn het Signature-type uit op het
  v2-schema (signatoryTypeCode i.p.v. signatoryType waar van toepassing).

Constraints:
- Alleen bovenstaande bestanden + de createSignature-helper aanraken.
- Geen functionele wijziging buiten de typefix.

Definition of done:
- `pnpm typecheck` levert in AssetTree.tsx, LocationAssetTree.tsx en CompleteInspectionPage.tsx
  geen fouten meer (de pre-existing fouten elders mogen blijven staan — noteer ze in de PR).
- Dexie-migratietest en offline round-trip (bestaand) blijven groen.
- Commit: `fix(pwa): v2 typecheck — asset status map + signature shape (Fase 3)`.
```

> Optioneel, los hiervan: een aparte PR `chore(pwa): typecheck-schuld opruimen` voor de
> ongebruikte imports + de documents/PhotoViewer-fouten. Veel daarvan lost in Fase 4 op
> zodra het documentdomein uitlijnt.
