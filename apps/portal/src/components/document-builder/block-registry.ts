// ===========================================
// Document Builder — Block registry
// ===========================================
//
// Registratiesysteem voor block types. Nieuwe blocks worden geregistreerd via
// registerBlock(); de editor haalt definities op via getBlock()/getBlocksByCategory().

import type { DocBlockDefinition, DocBlockCategory, DocBlockType } from './types';
import {
  defaultRichTextContent,
  defaultImageContent,
  defaultDividerContent,
  defaultSpacerContent,
  defaultPlaceholderContent,
  defaultTocContent,
  defaultFindingsTableContent,
  defaultAssetSummaryContent,
  defaultMeasurementDataContent,
  defaultSignatureBlockContent,
} from './block-defaults';

const registry = new Map<DocBlockType, DocBlockDefinition>();

export function registerBlock(definition: DocBlockDefinition): void {
  registry.set(definition.type, definition);
}

export function getBlock(type: DocBlockType): DocBlockDefinition | undefined {
  return registry.get(type);
}

export function getBlocksByCategory(category: DocBlockCategory): DocBlockDefinition[] {
  return Array.from(registry.values()).filter((b) => b.category === category);
}

export function getAllBlocks(): DocBlockDefinition[] {
  return Array.from(registry.values());
}

// ── Standaard block-registraties ────────────────────────────────────

// Core
registerBlock({
  type: 'rich_text',
  label: 'Tekst',
  description: 'Rijke tekst met opmaak',
  icon: 'text',
  category: 'core',
  defaultContent: defaultRichTextContent,
  supportsHalfWidth: true,
  isDeletable: true,
});

registerBlock({
  type: 'image',
  label: 'Afbeelding',
  description: 'Afbeelding toevoegen',
  icon: 'image',
  category: 'core',
  defaultContent: defaultImageContent,
  supportsHalfWidth: true,
  isDeletable: true,
});

// Layout
registerBlock({
  type: 'divider',
  label: 'Scheidingslijn',
  description: 'Horizontale lijn',
  icon: 'divider',
  category: 'layout',
  defaultContent: defaultDividerContent,
  supportsHalfWidth: false,
  isDeletable: true,
});

registerBlock({
  type: 'spacer',
  label: 'Ruimte',
  description: 'Verticale ruimte',
  icon: 'spacer',
  category: 'layout',
  defaultContent: defaultSpacerContent,
  supportsHalfWidth: false,
  isDeletable: true,
});

// Inspectie
registerBlock({
  type: 'placeholder',
  label: 'Variabele',
  description: 'Dynamische variabele / placeholder',
  icon: 'placeholder',
  category: 'inspection',
  defaultContent: defaultPlaceholderContent,
  supportsHalfWidth: true,
  isDeletable: true,
});

registerBlock({
  type: 'toc',
  label: 'Inhoudsopgave',
  description: 'Automatisch gegenereerde inhoudsopgave',
  icon: 'toc',
  category: 'inspection',
  defaultContent: defaultTocContent,
  supportsHalfWidth: false,
  isDeletable: true,
});

registerBlock({
  type: 'findings_table',
  label: 'Bevindingentabel',
  description: 'Overzicht van inspectie-bevindingen',
  icon: 'table',
  category: 'inspection',
  defaultContent: defaultFindingsTableContent,
  supportsHalfWidth: false,
  isDeletable: true,
});

registerBlock({
  type: 'asset_summary',
  label: 'Installatie-overzicht',
  description: 'Samenvatting van geïnspecteerde assets',
  icon: 'package',
  category: 'inspection',
  defaultContent: defaultAssetSummaryContent,
  supportsHalfWidth: false,
  isDeletable: true,
});

registerBlock({
  type: 'measurement_data',
  label: 'Meetgegevens',
  description: 'Meetgegevens uit meetbladen',
  icon: 'chart',
  category: 'inspection',
  defaultContent: defaultMeasurementDataContent,
  supportsHalfWidth: false,
  isDeletable: true,
});

registerBlock({
  type: 'signature_block',
  label: 'Handtekeningen',
  description: 'Handtekeningvelden',
  icon: 'signature',
  category: 'inspection',
  defaultContent: defaultSignatureBlockContent,
  supportsHalfWidth: false,
  isDeletable: true,
});
