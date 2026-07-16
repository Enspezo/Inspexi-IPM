import { NotificationType, type Notification } from '@/types';

/**
 * Single source of truth voor het groeperen van notificaties per "model"
 * (domein) en voor de Nederlandse type-labels.
 *
 * Er bestaat géén model-kolom in de database: het model wordt afgeleid uit
 * het NotificationType (de prefix codeert het domein). Deze module is de
 * enige plek waar de FE-mapping en de type-labels worden gedefinieerd —
 * voorheen stonden de labels gedupliceerd in notifications-page,
 * organization-settings-page en notification-prefs-card.
 *
 * De backend houdt een bewust parallelle mapping aan
 * (apps/api/src/modules/notifications/notifications.constants.ts) omdat FE en
 * BE geen package delen; covering-tests aan beide kanten bewaken dat de
 * mappings volledig blijven wanneer er types bijkomen.
 */

export type NotificationModel =
  | 'OFFERTES'
  | 'AANVRAGEN'
  | 'KLANTVRAGEN'
  | 'TAKEN'
  | 'DOCUMENTEN'
  | 'PLANNING'
  | 'PROJECTEN'
  | 'FOUTMELDINGEN'
  | 'INSPECTIEPLANNEN'
  | 'MEETMIDDELEN'
  | 'CHAT'
  | 'SUPPORT'
  | 'BESCHIKBAARHEID';

interface NotificationModelDef {
  key: NotificationModel;
  label: string;
  types: NotificationType[];
}

/**
 * Geordende modeldefinitie. De volgorde bepaalt de weergavevolgorde in de
 * filter-dropdown én in de profiel-accordion.
 */
export const NOTIFICATION_MODELS: NotificationModelDef[] = [
  {
    key: 'OFFERTES',
    label: 'Offertes',
    types: [
      NotificationType.OFFERTE_TER_GOEDKEURING,
      NotificationType.OFFERTE_GOEDGEKEURD,
      NotificationType.OFFERTE_AFGEWEZEN,
      NotificationType.OFFERTE_VERSTUURD,
      NotificationType.OFFERTE_BEKEKEN,
      NotificationType.OFFERTE_ONDERTEKEND,
      NotificationType.OFFERTE_VERLOPEN,
      NotificationType.OFFERTE_GOEDKEURING_GEVRAAGD_TEAM,
      NotificationType.OFFERTE_GOEDKEURING_GEVRAAGD_PERSOON,
      NotificationType.OFFERTE_GOEDKEURING_AFGEHANDELD,
    ],
  },
  {
    key: 'AANVRAGEN',
    label: 'Aanvragen',
    types: [
      NotificationType.AANVRAAG_TOEGEWEZEN,
      NotificationType.AANVRAAG_STATUS_GEWIJZIGD,
    ],
  },
  {
    key: 'KLANTVRAGEN',
    label: 'Klantvragen',
    types: [
      NotificationType.NIEUWE_VRAAG_KLANT,
      NotificationType.ANTWOORD_OP_VRAAG,
    ],
  },
  {
    key: 'TAKEN',
    label: 'Taken',
    types: [
      NotificationType.TAAK_TOEGEWEZEN,
      NotificationType.TAAK_STATUS_GEWIJZIGD,
    ],
  },
  {
    key: 'DOCUMENTEN',
    label: 'Documenten',
    types: [NotificationType.DOCUMENT_GEUPLOAD],
  },
  {
    key: 'PLANNING',
    label: 'Planning/Afspraken',
    types: [
      NotificationType.AFSPRAAK_ACCEPTATIE_VERZOEK,
      NotificationType.AFSPRAAK_GEACCEPTEERD,
      NotificationType.AFSPRAAK_GEWEIGERD,
      NotificationType.AFSPRAAK_VERPLAATST,
      NotificationType.AFSPRAAK_VERZETTEN_VERZOEK,
      NotificationType.AFSPRAAK_BEVESTIGING_VERSTUURD,
    ],
  },
  {
    key: 'PROJECTEN',
    label: 'Projecten',
    types: [
      NotificationType.PROJECT_AANGEMAAKT,
      NotificationType.PROJECT_STATUS_GEWIJZIGD,
      NotificationType.FASE_STATUS_GEWIJZIGD,
      NotificationType.MILESTONE_HERINNERING,
      NotificationType.MILESTONE_VERLOPEN,
    ],
  },
  {
    key: 'FOUTMELDINGEN',
    label: 'Foutmeldingen',
    types: [NotificationType.FOUTMELDING_INGEDIEND],
  },
  {
    key: 'INSPECTIEPLANNEN',
    label: 'Inspectieplannen',
    types: [
      NotificationType.INSPECTIEPLAN_TOEGEWEZEN,
      NotificationType.INSPECTIEPLAN_TER_REVIEW,
      NotificationType.INSPECTIEPLAN_GOEDGEKEURD,
      NotificationType.INSPECTIEPLAN_AFGEKEURD,
      NotificationType.AI_REVIEW_GEREED,
    ],
  },
  {
    key: 'MEETMIDDELEN',
    label: 'Meetmiddelen',
    types: [
      NotificationType.MEETMIDDEL_KALIBRATIE_BINNENKORT,
      NotificationType.MEETMIDDEL_KALIBRATIE_VERLOPEN,
    ],
  },
  {
    key: 'CHAT',
    label: 'Chat',
    types: [
      NotificationType.CHAT_BERICHT,
      NotificationType.CHAT_TEAM_BERICHT,
      NotificationType.CHAT_MENTION,
    ],
  },
  {
    key: 'SUPPORT',
    label: 'Support',
    types: [
      NotificationType.SUPPORT_TICKET_AANGEMAAKT,
      NotificationType.SUPPORT_TICKET_REACTIE,
      NotificationType.SUPPORT_TICKET_STATUS,
    ],
  },
  {
    key: 'BESCHIKBAARHEID',
    label: 'Beschikbaarheid',
    types: [
      NotificationType.BESCHIKBAARHEID_GEWIJZIGD_DOOR_INSPECTEUR,
      NotificationType.BESCHIKBAARHEID_GEWIJZIGD_DOOR_MANAGER,
    ],
  },
];

/** NL-labels per NotificationType (enige bron). */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  [NotificationType.OFFERTE_TER_GOEDKEURING]: 'Offerte ter goedkeuring',
  [NotificationType.OFFERTE_GOEDGEKEURD]: 'Offerte goedgekeurd',
  [NotificationType.OFFERTE_AFGEWEZEN]: 'Offerte afgewezen',
  [NotificationType.OFFERTE_VERSTUURD]: 'Offerte verstuurd',
  [NotificationType.OFFERTE_BEKEKEN]: 'Offerte bekeken',
  [NotificationType.OFFERTE_ONDERTEKEND]: 'Offerte ondertekend',
  [NotificationType.OFFERTE_VERLOPEN]: 'Offerte verlopen',
  [NotificationType.OFFERTE_GOEDKEURING_GEVRAAGD_TEAM]: 'Offerte: teamgoedkeuring gevraagd',
  [NotificationType.OFFERTE_GOEDKEURING_GEVRAAGD_PERSOON]: 'Offerte: persoonlijke goedkeuring gevraagd',
  [NotificationType.OFFERTE_GOEDKEURING_AFGEHANDELD]: 'Offerte: goedkeuringsverzoek afgehandeld',
  [NotificationType.NIEUWE_VRAAG_KLANT]: 'Nieuwe vraag klant',
  [NotificationType.ANTWOORD_OP_VRAAG]: 'Antwoord op vraag',
  [NotificationType.AANVRAAG_TOEGEWEZEN]: 'Aanvraag toegewezen',
  [NotificationType.AANVRAAG_STATUS_GEWIJZIGD]: 'Aanvraag status gewijzigd',
  [NotificationType.TAAK_TOEGEWEZEN]: 'Taak toegewezen',
  [NotificationType.TAAK_STATUS_GEWIJZIGD]: 'Taakstatus gewijzigd',
  [NotificationType.DOCUMENT_GEUPLOAD]: 'Document geüpload',
  [NotificationType.AFSPRAAK_ACCEPTATIE_VERZOEK]: 'Afspraak: acceptatieverzoek',
  [NotificationType.AFSPRAAK_GEACCEPTEERD]: 'Afspraak geaccepteerd',
  [NotificationType.AFSPRAAK_GEWEIGERD]: 'Afspraak geweigerd',
  [NotificationType.AFSPRAAK_VERPLAATST]: 'Afspraak verplaatst',
  [NotificationType.AFSPRAAK_VERZETTEN_VERZOEK]: 'Afspraak: verzetten verzoek',
  [NotificationType.AFSPRAAK_BEVESTIGING_VERSTUURD]: 'Afspraak bevestigd',
  [NotificationType.PROJECT_AANGEMAAKT]: 'Project aangemaakt',
  [NotificationType.PROJECT_STATUS_GEWIJZIGD]: 'Project status gewijzigd',
  [NotificationType.FOUTMELDING_INGEDIEND]: 'Foutmelding ingediend',
  [NotificationType.INSPECTIEPLAN_TOEGEWEZEN]: 'Inspectieplan toegewezen',
  [NotificationType.INSPECTIEPLAN_TER_REVIEW]: 'Inspectieplan ter review',
  [NotificationType.INSPECTIEPLAN_GOEDGEKEURD]: 'Inspectieplan goedgekeurd',
  [NotificationType.INSPECTIEPLAN_AFGEKEURD]: 'Inspectieplan afgekeurd',
  [NotificationType.AI_REVIEW_GEREED]: 'AI-controle afgerond',
  [NotificationType.CHAT_BERICHT]: 'Nieuw chatbericht',
  [NotificationType.CHAT_TEAM_BERICHT]: 'Nieuw team-chatbericht',
  [NotificationType.CHAT_MENTION]: 'Genoemd in een chat',
  [NotificationType.SUPPORT_TICKET_AANGEMAAKT]: 'Nieuw supportticket',
  [NotificationType.SUPPORT_TICKET_REACTIE]: 'Reactie op supportticket',
  [NotificationType.SUPPORT_TICKET_STATUS]: 'Supportticket status gewijzigd',
  [NotificationType.MEETMIDDEL_KALIBRATIE_BINNENKORT]: 'Kalibratie verloopt binnenkort',
  [NotificationType.MEETMIDDEL_KALIBRATIE_VERLOPEN]: 'Kalibratie verlopen',
  [NotificationType.FASE_STATUS_GEWIJZIGD]: 'Fasestatus gewijzigd',
  [NotificationType.MILESTONE_HERINNERING]: 'Milestone-herinnering',
  [NotificationType.MILESTONE_VERLOPEN]: 'Milestone verlopen',
  [NotificationType.BESCHIKBAARHEID_GEWIJZIGD_DOOR_INSPECTEUR]: 'Beschikbaarheid gewijzigd door inspecteur',
  [NotificationType.BESCHIKBAARHEID_GEWIJZIGD_DOOR_MANAGER]: 'Beschikbaarheid gewijzigd door manager',
};

/** Afgeleide lookup: type → model-key. */
const TYPE_TO_MODEL: Record<string, NotificationModel> = Object.fromEntries(
  NOTIFICATION_MODELS.flatMap((m) => m.types.map((t) => [t, m.key])),
) as Record<string, NotificationModel>;

/** Het model waartoe een type behoort (of undefined indien niet gemapt). */
export function getModelForType(
  type: NotificationType,
): NotificationModel | undefined {
  return TYPE_TO_MODEL[type];
}

/** De types die bij een model horen (lege array bij onbekend model). */
export function getTypesForModel(
  model: NotificationModel,
): NotificationType[] {
  return NOTIFICATION_MODELS.find((m) => m.key === model)?.types ?? [];
}

/** NL-label voor een type, met fallback op de ruwe enum-waarde. */
export function getTypeLabel(type: NotificationType | string): string {
  return NOTIFICATION_TYPE_LABELS[type as NotificationType] ?? String(type);
}

/** NL-label voor een model-key. */
export function getModelLabel(model: NotificationModel): string {
  return NOTIFICATION_MODELS.find((m) => m.key === model)?.label ?? model;
}

/**
 * Doel-route voor een notificatie op basis van entityType (of null als er geen
 * koppeling is). Eén bron-van-waarheid: de header-dropdown én de
 * notificatiepagina delen deze mapping zodat ze niet kunnen driften.
 *
 * Let op: entityType-waarden volgen wat de backend dispatcht — meestal de
 * lowercase resource-naam, maar supporttickets gebruiken het PascalCase
 * modelnaam `SupportTicket`.
 */
export function getNotificationRoute(notif: Notification): string | null {
  if (!notif.entityType || !notif.entityId) return null;
  switch (notif.entityType) {
    case 'quote':
      return `/quotes/${notif.entityId}`;
    case 'request':
      return `/requests/${notif.entityId}`;
    case 'task':
      return `/tasks/${notif.entityId}`;
    case 'document':
      return '/documents';
    case 'planningItem':
      return `/planning/${notif.entityId}`;
    case 'SupportTicket':
      return `/help/tickets/${notif.entityId}`;
    case 'measurementInstrument':
      return `/meetmiddelen/${notif.entityId}`;
    case 'inspectionPlan':
      return `/inspections/${notif.entityId}`;
    default:
      return null;
  }
}
