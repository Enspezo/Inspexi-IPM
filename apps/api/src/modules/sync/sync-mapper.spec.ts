import { BadRequestException } from '@nestjs/common';
import { SYNC_ENTITIES, toDbData, toChildRows, toWire } from './sync-mapper';

// M1: de `data`-payload van een sync-push is een kale `@IsObject()` en ontloopt dus
// de class-validator-whitelist. De veiligheid leunt op `toDbData`, dat uitsluitend
// de per-entiteit toegestane velden doorlaat. Deze regressietests borgen dat vreemde
// en server-owned velden nooit in de Prisma-schrijfactie belanden.
describe('sync-mapper — toDbData whitelist (M1)', () => {
  it('drops non-whitelisted fields and keeps only allowed scalars', () => {
    const out = toDbData('inspectionPlans', {
      projectName: 'X',
      normTypeCode: 'NEN1010',
      // server-owned / vreemd — moeten allemaal verdwijnen:
      id: 'client-uuid',
      orgId: 'EVIL-ORG',
      nodeNumber: 'HACK',
      path: 'a.b.c',
      depth: 9,
      __proto__: { polluted: true } as unknown,
      randomField: 'nope',
    } as Record<string, unknown>);

    expect(out).toEqual({ projectName: 'X', normTypeCode: 'NEN1010' });
    expect(out).not.toHaveProperty('id');
    expect(out).not.toHaveProperty('orgId');
    expect(out).not.toHaveProperty('nodeNumber');
    expect(out).not.toHaveProperty('path');
    expect(out).not.toHaveProperty('randomField');
  });

  it('never surfaces server-owned createdBy/inspectorId via the whitelist', () => {
    // createdBy/inspectorId zijn uit `allowed` verwijderd → toDbData mag ze niet
    // teruggeven, ook niet als de client ze meestuurt. De service forceert ze zelf.
    const finding = toDbData('findings', { shortDescription: 'x', createdBy: 'ghost' });
    expect(finding).not.toHaveProperty('createdBy');

    const vi = toDbData('visualInspections', { status: 'in_progress', inspectorId: 'ghost' });
    expect(vi).not.toHaveProperty('inspectorId');
  });

  it('coerces whitelisted date strings to Date instances', () => {
    const out = toDbData('inspectionPlans', { plannedDate: '2026-01-02T00:00:00.000Z', projectName: 'X' });
    expect(out.plannedDate).toBeInstanceOf(Date);
    expect(out.projectName).toBe('X');
  });

  it('none of the entity allow-lists leak orgId/id/createdBy/inspectorId/nodeNumber', () => {
    const forbidden = ['orgId', 'id', 'createdBy', 'inspectorId', 'nodeNumber', 'path', 'depth'];
    for (const key of Object.keys(SYNC_ENTITIES) as Array<keyof typeof SYNC_ENTITIES>) {
      for (const banned of forbidden) {
        expect(SYNC_ENTITIES[key].allowed).not.toContain(banned);
      }
    }
  });
});

describe('sync-mapper — JSON-kolomvalidatie (permissief, garbage → 400)', () => {
  it('accepts existing-shaped JSON payloads (object/array passthrough)', () => {
    expect(toDbData('assetNodes', { technicalData: { spanning: '230V', extra: { a: 1 } } })).toEqual({
      technicalData: { spanning: '230V', extra: { a: 1 } },
    });
    expect(
      toDbData('visualInspections', {
        checklistResults: [{ itemCode: 'earthing', result: 'pass' }],
      }),
    ).toEqual({ checklistResults: [{ itemCode: 'earthing', result: 'pass' }] });
    expect(toDbData('findings', { classificationValues: { SEVERITY: 'C2' } })).toEqual({
      classificationValues: { SEVERITY: 'C2' },
    });
    expect(toDbData('inspectionPlans', { metadata: { any: 'obj' } })).toEqual({
      metadata: { any: 'obj' },
    });
    // finalCheckResults is een object { passed, results } — geen array.
    expect(
      toDbData('measurementSheetRecords', { finalCheckResults: { passed: true, results: [] } }),
    ).toEqual({ finalCheckResults: { passed: true, results: [] } });
  });

  it('rejects an object where an array is expected (and vice versa)', () => {
    expect(() => toDbData('visualInspections', { checklistResults: { not: 'an array' } })).toThrow(
      BadRequestException,
    );
    expect(() => toDbData('measurementRecords', { measurements: 'oops' })).toThrow(BadRequestException);
    expect(() => toDbData('assetNodes', { technicalData: ['not', 'an', 'object'] })).toThrow(
      BadRequestException,
    );
    expect(() => toDbData('findings', { classificationValues: 'garbage' })).toThrow(BadRequestException);
    // non-nullable metadata → null is garbage.
    expect(() => toDbData('inspectionPlans', { metadata: null })).toThrow(BadRequestException);
  });
});

describe('sync-mapper — toChildRows whitelist', () => {
  const child = SYNC_ENTITIES.standaloneMeasurements.nestedChild!;

  it('whitelists nested child scalars and drops the rest', () => {
    const rows = toChildRows(child, {
      values: [{ fieldName: 'R', fieldType: 'number', value: '1', unit: 'MΩ', passFailCode: 'pass', bogus: 'drop' }],
    });
    expect(rows).toEqual([{ fieldName: 'R', fieldType: 'number', value: '1', unit: 'MΩ', passFailCode: 'pass' }]);
  });

  it('returns null when the wire field is absent (leave existing children untouched)', () => {
    expect(toChildRows(child, {})).toBeNull();
  });
});

describe('sync-mapper — toWire', () => {
  it('strips internal-only fields from pull records', () => {
    const wire = toWire({ id: 'p1', projectName: 'X', internalNotes: 'SECRET' });
    expect(wire).not.toHaveProperty('internalNotes');
    expect(wire).toHaveProperty('projectName', 'X');
  });
});
