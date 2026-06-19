import { ContactDisplayMode } from '@prisma/client';

/**
 * Organisatie-instellingen die per kanaal bepalen óf en hoe de inspecteur-contactgegevens
 * in het klantportaal zichtbaar zijn.
 */
export interface InspectorContactSettings {
  inspectorPhoneDisplay: ContactDisplayMode;
  inspectorEmailDisplay: ContactDisplayMode;
  inspectorStaticPhone: string | null;
  inspectorStaticEmail: string | null;
}

/**
 * De rauwe inspecteur-velden die de resolutie nodig heeft. Deze velden (en de consent-vlaggen)
 * mogen NOOIT direct naar de client; alleen het resultaat van {@link resolveInspectorContact}.
 */
export interface InspectorContactSource {
  contactPhone: string | null;
  contactEmail: string | null;
  sharePhoneWithClients: boolean;
  shareEmailWithClients: boolean;
}

/** Het enige contact-resultaat dat naar de klant gestuurd mag worden. */
export interface ResolvedInspectorContact {
  phone: string | null;
  email: string | null;
}

/** Trimt en normaliseert lege/whitespace-strings naar null. */
function clean(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolutie voor één kanaal (telefoon óf e-mail), volledig onafhankelijk van het andere kanaal.
 * - NONE      → niets tonen.
 * - STATIC    → de vaste org-waarde (of niets als die leeg is).
 * - INSPECTOR → de inspecteur-waarde *mits* ingevuld én toestemming voor dit kanaal;
 *               anders altijd terugvallen op de statische org-waarde (en die kan ook leeg zijn → niets).
 */
function resolveChannel(
  mode: ContactDisplayMode,
  inspectorValue: string | null,
  inspectorConsent: boolean,
  staticValue: string | null,
): string | null {
  switch (mode) {
    case ContactDisplayMode.STATIC:
      return staticValue;
    case ContactDisplayMode.INSPECTOR:
      if (inspectorValue && inspectorConsent) return inspectorValue;
      return staticValue;
    case ContactDisplayMode.NONE:
    default:
      return null;
  }
}

/**
 * Bepaalt **server-side** welk telefoonnummer en/of e-mailadres van de inspecteur (indien überhaupt)
 * in het klantportaal getoond mag worden. Telefoon en e-mail worden onafhankelijk geresolved.
 *
 * Privacy: rauwe inspecteur-contactgegevens, consent-vlaggen en de org-modus verlaten de server nooit —
 * alleen het (mogelijk `null`) resultaat hiervan mag in een client-facing response.
 *
 * @param settings  org-instellingen (modus + statische waarden) per kanaal
 * @param inspector de toegewezen inspecteur (mag `null` zijn → INSPECTOR valt terug op statisch)
 */
export function resolveInspectorContact(
  settings: InspectorContactSettings,
  inspector: InspectorContactSource | null | undefined,
): ResolvedInspectorContact {
  const phone = resolveChannel(
    settings.inspectorPhoneDisplay,
    clean(inspector?.contactPhone),
    inspector?.sharePhoneWithClients === true,
    clean(settings.inspectorStaticPhone),
  );
  const email = resolveChannel(
    settings.inspectorEmailDisplay,
    clean(inspector?.contactEmail),
    inspector?.shareEmailWithClients === true,
    clean(settings.inspectorStaticEmail),
  );
  return { phone, email };
}
