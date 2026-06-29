import { Prisma } from '@prisma/client';
import {
  AUDITED_ENTITIES,
  AUDITED_MODELS,
  MODEL_TABLE_MAP,
  ALLOWED_ENTITY_TYPES,
  ENTITY_DISPLAYS,
} from './audited-entities';
import { resolveFkTargetModel, displayReference, delegateFor } from './fk-resolvers';

describe('audited-entities registry', () => {
  const dmmfByName = new Map(
    Prisma.dmmf.datamodel.models.map((m) => [m.name, m]),
  );

  it('has no duplicate models', () => {
    const names = AUDITED_ENTITIES.map((e) => e.model);
    expect(new Set(names).size).toBe(names.length);
  });

  it('derives the three lists from one source (no drift between them)', () => {
    expect(AUDITED_MODELS.size).toBe(AUDITED_ENTITIES.length);
    expect(Object.keys(MODEL_TABLE_MAP).length).toBe(AUDITED_ENTITIES.length);
    expect(ALLOWED_ENTITY_TYPES.size).toBe(AUDITED_ENTITIES.length);
  });

  // The drift guard the refactor exists for: every audited model must have a
  // table mapping AND an allowed-entry. By construction this holds, but the test
  // pins the invariant so a hand-edit that breaks it fails fast.
  it('every AUDITED_MODELS item has a table + allowed-entry', () => {
    for (const model of AUDITED_MODELS) {
      expect(typeof MODEL_TABLE_MAP[model]).toBe('string');
      expect(MODEL_TABLE_MAP[model].length).toBeGreaterThan(0);
      expect(ALLOWED_ENTITY_TYPES.has(model)).toBe(true);
      expect(ENTITY_DISPLAYS.has(model)).toBe(true);
    }
  });

  // Cross-checks the registry against the actual Prisma schema. Catches a model
  // being renamed/removed, or a wrong @@map table, the moment the schema changes.
  it('every registry model exists in the Prisma schema with the mapped table', () => {
    for (const entity of AUDITED_ENTITIES) {
      const model = dmmfByName.get(entity.model);
      expect(model).toBeDefined();
      expect(entity.table).toBe(model!.dbName);
    }
  });
});

describe('FK target resolution (per entityType, field)', () => {
  it('disambiguates locationId by owning entity', () => {
    // Beheer (CRM) domain → Location
    expect(resolveFkTargetModel('Request', 'locationId')).toBe('Location');
    expect(resolveFkTargetModel('Quote', 'locationId')).toBe('Location');
    expect(resolveFkTargetModel('Project', 'locationId')).toBe('Location');
  });

  it('resolves the unified AssetNode-tree foreign keys', () => {
    // Fase 2b: Asset/InspectionLocation zijn opgegaan in AssetNode (ltree-boom).
    expect(resolveFkTargetModel('AssetNode', 'parentId')).toBe('AssetNode');
    expect(resolveFkTargetModel('AssetNode', 'rootLocationId')).toBe('Location');
    expect(resolveFkTargetModel('Finding', 'assetNodeId')).toBe('AssetNode');
    expect(resolveFkTargetModel('LocationImage', 'nodeId')).toBe('AssetNode');
    expect(resolveFkTargetModel('StandaloneMeasurement', 'locationNodeId')).toBe('AssetNode');
    expect(resolveFkTargetModel('StandaloneMeasurement', 'linkedAssetNodeId')).toBe('AssetNode');
    expect(resolveFkTargetModel('InspectionPlanLocation', 'assetNodeId')).toBe('AssetNode');
  });

  it('disambiguates templateId by owning entity', () => {
    expect(resolveFkTargetModel('Quote', 'templateId')).toBe('QuoteTemplate');
    expect(resolveFkTargetModel('MeasurementSheetRecord', 'templateId')).toBe(
      'MeasurementSheetTemplate',
    );
  });

  it('resolves user foreign keys (relations and bare-string fallbacks)', () => {
    expect(resolveFkTargetModel('Contact', 'ownerId')).toBe('User');
    expect(resolveFkTargetModel('Finding', 'resolvedBy')).toBe('User');
    expect(resolveFkTargetModel('InspectionPlan', 'reviewerId')).toBe('User');
    // bare String columns without a Prisma relation fall back by convention
    expect(resolveFkTargetModel('NormTypeDefinition', 'createdBy')).toBe('User');
    expect(resolveFkTargetModel('GeneratedDocument', 'generatedBy')).toBe('User');
    // OrganizationFeature.updatedById now has a real FK relation → resolved via DMMF.
    expect(resolveFkTargetModel('OrganizationFeature', 'updatedById')).toBe('User');
    // InspectorCertificate.userId is a real relation → resolved via DMMF (PRD-11).
    expect(resolveFkTargetModel('InspectorCertificate', 'userId')).toBe('User');
  });

  it('resolves inspection-domain FKs the old global map missed', () => {
    expect(resolveFkTargetModel('Finding', 'findingTemplateId')).toBe('FindingTemplate');
    expect(resolveFkTargetModel('Finding', 'inspectionPlanId')).toBe('InspectionPlan');
    expect(resolveFkTargetModel('FindingTemplate', 'categoryId')).toBe('Category');
    expect(resolveFkTargetModel('GeneratedDocument', 'documentTemplateId')).toBe(
      'DocumentTemplate',
    );
    expect(resolveFkTargetModel('ContactPerson', 'roleId')).toBe('ContactPersonRoleOption');
  });

  it('returns undefined for non-foreign-key fields', () => {
    expect(resolveFkTargetModel('Contact', 'companyName')).toBeUndefined();
    expect(resolveFkTargetModel('AssetNode', 'name')).toBeUndefined();
  });
});

describe('reference display rendering', () => {
  it('renders audited entities and lookup targets', () => {
    expect(displayReference('User', { firstName: 'Jan', lastName: 'Jansen' })).toBe(
      'Jan Jansen',
    );
    expect(displayReference('Contact', { companyName: 'ACME' })).toBe('ACME');
    expect(
      displayReference('AssetNode', { name: 'Hal 3', identifier: 'L-3' }),
    ).toBe('Hal 3');
    // non-audited lookup target
    expect(displayReference('LostReason', { label: 'Te duur', code: 'PRICE' })).toBe(
      'Te duur',
    );
  });

  it('falls back to a generic field for unknown models', () => {
    expect(displayReference('SomethingUnknown', { title: 'X' })).toBe('X');
    expect(displayReference('SomethingUnknown', { id: 'abc' })).toBe('abc');
  });
});

describe('delegateFor', () => {
  it('converts a model name to its Prisma client delegate', () => {
    expect(delegateFor('AssetNode')).toBe('assetNode');
    expect(delegateFor('User')).toBe('user');
  });
});
