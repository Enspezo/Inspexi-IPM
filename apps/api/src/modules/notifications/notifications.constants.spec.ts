import { NotificationType } from '@prisma/client';
import {
  NOTIFICATION_MODEL_KEYS,
  NOTIFICATION_MODEL_TYPES,
  getTypesForModel,
} from './notifications.constants';

describe('Notification model mapping (BE)', () => {
  it('koppelt elk NotificationType aan precies één model', () => {
    const mapped = NOTIFICATION_MODEL_KEYS.flatMap((k) =>
      NOTIFICATION_MODEL_TYPES[k],
    );
    const allTypes = Object.values(NotificationType);

    // Volledige dekking: elk enum-type komt voor in de mapping.
    const missing = allTypes.filter((t) => !mapped.includes(t));
    expect(missing).toEqual([]);

    // Geen duplicaten en geen onbekende/overbodige types.
    expect(new Set(mapped).size).toBe(mapped.length);
    expect(mapped.length).toBe(allTypes.length);
  });

  it('NOTIFICATION_MODEL_KEYS dekt alle keys van NOTIFICATION_MODEL_TYPES', () => {
    expect(NOTIFICATION_MODEL_KEYS.sort()).toEqual(
      Object.keys(NOTIFICATION_MODEL_TYPES).sort(),
    );
  });

  it('getTypesForModel geeft de juiste types terug', () => {
    expect(getTypesForModel('TAKEN')).toEqual([
      NotificationType.TAAK_TOEGEWEZEN,
      NotificationType.TAAK_STATUS_GEWIJZIGD,
    ]);
    expect(getTypesForModel('DOCUMENTEN')).toEqual([
      NotificationType.DOCUMENT_GEUPLOAD,
    ]);
  });
});
