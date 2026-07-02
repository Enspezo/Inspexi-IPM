import { ContactDisplayMode } from '@prisma/client';
import {
  InspectorContactSettings,
  InspectorContactSource,
  resolveInspectorContact,
} from './resolve-inspector-contact';

/** Helper om snel org-instellingen te bouwen. */
function settings(overrides: Partial<InspectorContactSettings> = {}): InspectorContactSettings {
  return {
    inspectorPhoneDisplay: ContactDisplayMode.NONE,
    inspectorEmailDisplay: ContactDisplayMode.NONE,
    inspectorStaticPhone: null,
    inspectorStaticEmail: null,
    ...overrides,
  };
}

/** Helper om snel een inspecteur-bron te bouwen. */
function inspector(overrides: Partial<InspectorContactSource> = {}): InspectorContactSource {
  return {
    contactPhone: null,
    contactEmail: null,
    sharePhoneWithClients: false,
    shareEmailWithClients: false,
    ...overrides,
  };
}

describe('resolveInspectorContact', () => {
  describe('modus NONE', () => {
    it('toont niets, ongeacht inspecteur-waarde of statische waarde', () => {
      const result = resolveInspectorContact(
        settings({
          inspectorPhoneDisplay: ContactDisplayMode.NONE,
          inspectorEmailDisplay: ContactDisplayMode.NONE,
          inspectorStaticPhone: '+31 20 000 0000',
          inspectorStaticEmail: 'static@org.nl',
        }),
        inspector({
          contactPhone: '+31 6 11111111',
          contactEmail: 'insp@org.nl',
          sharePhoneWithClients: true,
          shareEmailWithClients: true,
        }),
      );
      expect(result).toEqual({ phone: null, email: null });
    });
  });

  describe('modus STATIC', () => {
    it('toont de statische waarde', () => {
      const result = resolveInspectorContact(
        settings({
          inspectorPhoneDisplay: ContactDisplayMode.STATIC,
          inspectorEmailDisplay: ContactDisplayMode.STATIC,
          inspectorStaticPhone: '+31 20 123 4567',
          inspectorStaticEmail: 'klantcontact@org.nl',
        }),
        inspector(),
      );
      expect(result).toEqual({ phone: '+31 20 123 4567', email: 'klantcontact@org.nl' });
    });

    it('negeert de inspecteur-waarde, zelfs mét toestemming', () => {
      const result = resolveInspectorContact(
        settings({
          inspectorPhoneDisplay: ContactDisplayMode.STATIC,
          inspectorEmailDisplay: ContactDisplayMode.STATIC,
          inspectorStaticPhone: '+31 20 123 4567',
          inspectorStaticEmail: 'klantcontact@org.nl',
        }),
        inspector({
          contactPhone: '+31 6 11111111',
          contactEmail: 'insp@org.nl',
          sharePhoneWithClients: true,
          shareEmailWithClients: true,
        }),
      );
      expect(result).toEqual({ phone: '+31 20 123 4567', email: 'klantcontact@org.nl' });
    });

    it('toont niets als de statische waarde leeg of whitespace is', () => {
      const result = resolveInspectorContact(
        settings({
          inspectorPhoneDisplay: ContactDisplayMode.STATIC,
          inspectorEmailDisplay: ContactDisplayMode.STATIC,
          inspectorStaticPhone: '',
          inspectorStaticEmail: '   ',
        }),
        inspector({ contactPhone: '+31 6 11111111', sharePhoneWithClients: true }),
      );
      expect(result).toEqual({ phone: null, email: null });
    });
  });

  describe('modus INSPECTOR — consent-pad', () => {
    it('toont de inspecteur-waarde als die is ingevuld én toestemming is gegeven', () => {
      const result = resolveInspectorContact(
        settings({
          inspectorPhoneDisplay: ContactDisplayMode.INSPECTOR,
          inspectorEmailDisplay: ContactDisplayMode.INSPECTOR,
          inspectorStaticPhone: '+31 20 123 4567',
          inspectorStaticEmail: 'klantcontact@org.nl',
        }),
        inspector({
          contactPhone: '+31 6 12345678',
          contactEmail: 'tom@org.nl',
          sharePhoneWithClients: true,
          shareEmailWithClients: true,
        }),
      );
      expect(result).toEqual({ phone: '+31 6 12345678', email: 'tom@org.nl' });
    });

    it('toont de inspecteur-waarde ook zónder statische terugval', () => {
      const result = resolveInspectorContact(
        settings({
          inspectorPhoneDisplay: ContactDisplayMode.INSPECTOR,
          inspectorEmailDisplay: ContactDisplayMode.INSPECTOR,
          inspectorStaticPhone: null,
          inspectorStaticEmail: null,
        }),
        inspector({
          contactPhone: '+31 6 12345678',
          contactEmail: 'tom@org.nl',
          sharePhoneWithClients: true,
          shareEmailWithClients: true,
        }),
      );
      expect(result).toEqual({ phone: '+31 6 12345678', email: 'tom@org.nl' });
    });
  });

  describe('modus INSPECTOR — terugval naar statisch', () => {
    it('valt terug op statisch wanneer de inspecteur géén toestemming geeft', () => {
      const result = resolveInspectorContact(
        settings({
          inspectorPhoneDisplay: ContactDisplayMode.INSPECTOR,
          inspectorEmailDisplay: ContactDisplayMode.INSPECTOR,
          inspectorStaticPhone: '+31 20 123 4567',
          inspectorStaticEmail: 'klantcontact@org.nl',
        }),
        inspector({
          contactPhone: '+31 6 12345678',
          contactEmail: 'tom@org.nl',
          sharePhoneWithClients: false,
          shareEmailWithClients: false,
        }),
      );
      expect(result).toEqual({ phone: '+31 20 123 4567', email: 'klantcontact@org.nl' });
    });

    it('valt terug op statisch wanneer de inspecteur-waarde leeg is (ondanks toestemming)', () => {
      const result = resolveInspectorContact(
        settings({
          inspectorPhoneDisplay: ContactDisplayMode.INSPECTOR,
          inspectorEmailDisplay: ContactDisplayMode.INSPECTOR,
          inspectorStaticPhone: '+31 20 123 4567',
          inspectorStaticEmail: 'klantcontact@org.nl',
        }),
        inspector({
          contactPhone: '',
          contactEmail: '   ',
          sharePhoneWithClients: true,
          shareEmailWithClients: true,
        }),
      );
      expect(result).toEqual({ phone: '+31 20 123 4567', email: 'klantcontact@org.nl' });
    });

    it('valt terug op statisch wanneer de inspecteur null is', () => {
      const result = resolveInspectorContact(
        settings({
          inspectorPhoneDisplay: ContactDisplayMode.INSPECTOR,
          inspectorEmailDisplay: ContactDisplayMode.INSPECTOR,
          inspectorStaticPhone: '+31 20 123 4567',
          inspectorStaticEmail: 'klantcontact@org.nl',
        }),
        null,
      );
      expect(result).toEqual({ phone: '+31 20 123 4567', email: 'klantcontact@org.nl' });
    });

    it('toont niets wanneer er geen consent is én ook de statische waarde leeg is', () => {
      const result = resolveInspectorContact(
        settings({
          inspectorPhoneDisplay: ContactDisplayMode.INSPECTOR,
          inspectorEmailDisplay: ContactDisplayMode.INSPECTOR,
          inspectorStaticPhone: null,
          inspectorStaticEmail: null,
        }),
        inspector({
          contactPhone: '+31 6 12345678',
          contactEmail: 'tom@org.nl',
          sharePhoneWithClients: false,
          shareEmailWithClients: false,
        }),
      );
      expect(result).toEqual({ phone: null, email: null });
    });
  });

  describe('kanalen zijn volledig onafhankelijk', () => {
    it('telefoon = inspecteur (consent), e-mail = statisch', () => {
      const result = resolveInspectorContact(
        settings({
          inspectorPhoneDisplay: ContactDisplayMode.INSPECTOR,
          inspectorEmailDisplay: ContactDisplayMode.STATIC,
          inspectorStaticPhone: '+31 20 123 4567',
          inspectorStaticEmail: 'klantcontact@org.nl',
        }),
        inspector({
          contactPhone: '+31 6 12345678',
          contactEmail: 'tom@org.nl',
          sharePhoneWithClients: true,
          shareEmailWithClients: true,
        }),
      );
      // telefoon → inspecteur-waarde; e-mail → statisch (modus STATIC negeert inspecteur)
      expect(result).toEqual({ phone: '+31 6 12345678', email: 'klantcontact@org.nl' });
    });

    it('telefoon = inspecteur-consent, e-mail = INSPECTOR-terugval (geen e-mail-consent)', () => {
      // Dit is exact het seed-scenario van de demo-org.
      const result = resolveInspectorContact(
        settings({
          inspectorPhoneDisplay: ContactDisplayMode.INSPECTOR,
          inspectorEmailDisplay: ContactDisplayMode.INSPECTOR,
          inspectorStaticPhone: '+31 20 123 4567',
          inspectorStaticEmail: 'klantcontact@org.nl',
        }),
        inspector({
          contactPhone: '+31 6 12 34 56 78',
          contactEmail: 'tom.visser@org.nl',
          sharePhoneWithClients: true,
          shareEmailWithClients: false,
        }),
      );
      expect(result).toEqual({ phone: '+31 6 12 34 56 78', email: 'klantcontact@org.nl' });
    });

    it('telefoon NONE, e-mail INSPECTOR (consent) — telefoon blijft verborgen', () => {
      const result = resolveInspectorContact(
        settings({
          inspectorPhoneDisplay: ContactDisplayMode.NONE,
          inspectorEmailDisplay: ContactDisplayMode.INSPECTOR,
          inspectorStaticPhone: '+31 20 123 4567',
          inspectorStaticEmail: null,
        }),
        inspector({
          contactPhone: '+31 6 12345678',
          contactEmail: 'tom@org.nl',
          sharePhoneWithClients: true,
          shareEmailWithClients: true,
        }),
      );
      expect(result).toEqual({ phone: null, email: 'tom@org.nl' });
    });
  });

  describe('whitespace-normalisatie', () => {
    it('trimt de getoonde waarde', () => {
      const result = resolveInspectorContact(
        settings({
          inspectorPhoneDisplay: ContactDisplayMode.INSPECTOR,
          inspectorEmailDisplay: ContactDisplayMode.STATIC,
          inspectorStaticEmail: '  klantcontact@org.nl  ',
        }),
        inspector({ contactPhone: '  +31 6 12345678  ', sharePhoneWithClients: true }),
      );
      expect(result).toEqual({ phone: '+31 6 12345678', email: 'klantcontact@org.nl' });
    });
  });
});
