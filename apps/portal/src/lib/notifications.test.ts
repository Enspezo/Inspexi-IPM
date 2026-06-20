import { describe, it, expect } from 'vitest';
import { NotificationType } from '@/types';
import {
  NOTIFICATION_MODELS,
  NOTIFICATION_TYPE_LABELS,
  getModelForType,
  getTypesForModel,
} from './notifications';

describe('notifications model mapping', () => {
  it('koppelt elk NotificationType aan precies één model', () => {
    const allTypes = Object.values(NotificationType);
    for (const type of allTypes) {
      const model = getModelForType(type);
      expect(model, `Type ${type} mist een model in NOTIFICATION_MODELS`).toBeDefined();
    }
  });

  it('bevat geen onbekende of dubbele types in de mapping', () => {
    const mapped = NOTIFICATION_MODELS.flatMap((m) => m.types);
    const valid = new Set(Object.values(NotificationType));

    // Geen onbekende types
    for (const type of mapped) {
      expect(valid.has(type), `Onbekend type ${type} in mapping`).toBe(true);
    }

    // Geen duplicaten (elk type in exact één model)
    expect(new Set(mapped).size).toBe(mapped.length);
    // Volledige dekking
    expect(new Set(mapped).size).toBe(valid.size);
  });

  it('heeft een NL-label voor elk NotificationType', () => {
    for (const type of Object.values(NotificationType)) {
      expect(NOTIFICATION_TYPE_LABELS[type]).toBeTruthy();
    }
  });

  it('getTypesForModel geeft de types van een model terug', () => {
    expect(getTypesForModel('TAKEN')).toEqual([
      NotificationType.TAAK_TOEGEWEZEN,
      NotificationType.TAAK_STATUS_GEWIJZIGD,
    ]);
    expect(getTypesForModel('DOCUMENTEN')).toEqual([
      NotificationType.DOCUMENT_GEUPLOAD,
    ]);
  });
});
