import { NotificationType } from '@prisma/client';

/**
 * "Model"-indeling (domein) van notificaties, server-side.
 *
 * Er is geen model-kolom in de database: het model wordt afgeleid uit het
 * NotificationType. Deze mapping wordt gebruikt om op /notifications te kunnen
 * filteren op een heel domein (model → set van types) met correcte server-side
 * paginatie.
 *
 * FE en BE delen geen package, dus deze mapping dupliceert bewust de
 * FE-variant (apps/portal/src/lib/notifications.ts). De covering-test
 * (notifications.constants.spec.ts) faalt zodra een NotificationType niet in
 * deze mapping zit, zodat de mappings niet stilletjes uit elkaar lopen.
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
  | 'SUPPORT';

export const NOTIFICATION_MODEL_KEYS: NotificationModel[] = [
  'OFFERTES',
  'AANVRAGEN',
  'KLANTVRAGEN',
  'TAKEN',
  'DOCUMENTEN',
  'PLANNING',
  'PROJECTEN',
  'FOUTMELDINGEN',
  'INSPECTIEPLANNEN',
  'MEETMIDDELEN',
  'CHAT',
  'SUPPORT',
];

export const NOTIFICATION_MODEL_TYPES: Record<
  NotificationModel,
  NotificationType[]
> = {
  OFFERTES: [
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
  AANVRAGEN: [
    NotificationType.AANVRAAG_TOEGEWEZEN,
    NotificationType.AANVRAAG_STATUS_GEWIJZIGD,
  ],
  KLANTVRAGEN: [
    NotificationType.NIEUWE_VRAAG_KLANT,
    NotificationType.ANTWOORD_OP_VRAAG,
  ],
  TAKEN: [
    NotificationType.TAAK_TOEGEWEZEN,
    NotificationType.TAAK_STATUS_GEWIJZIGD,
  ],
  DOCUMENTEN: [NotificationType.DOCUMENT_GEUPLOAD],
  PLANNING: [
    NotificationType.AFSPRAAK_ACCEPTATIE_VERZOEK,
    NotificationType.AFSPRAAK_GEACCEPTEERD,
    NotificationType.AFSPRAAK_GEWEIGERD,
    NotificationType.AFSPRAAK_VERPLAATST,
    NotificationType.AFSPRAAK_VERZETTEN_VERZOEK,
    NotificationType.AFSPRAAK_BEVESTIGING_VERSTUURD,
  ],
  PROJECTEN: [
    NotificationType.PROJECT_AANGEMAAKT,
    NotificationType.PROJECT_STATUS_GEWIJZIGD,
  ],
  FOUTMELDINGEN: [NotificationType.FOUTMELDING_INGEDIEND],
  INSPECTIEPLANNEN: [
    NotificationType.INSPECTIEPLAN_TOEGEWEZEN,
    NotificationType.INSPECTIEPLAN_TER_REVIEW,
    NotificationType.INSPECTIEPLAN_GOEDGEKEURD,
    NotificationType.INSPECTIEPLAN_AFGEKEURD,
  ],
  MEETMIDDELEN: [
    NotificationType.MEETMIDDEL_KALIBRATIE_BINNENKORT,
    NotificationType.MEETMIDDEL_KALIBRATIE_VERLOPEN,
  ],
  CHAT: [
    NotificationType.CHAT_BERICHT,
    NotificationType.CHAT_TEAM_BERICHT,
    NotificationType.CHAT_MENTION,
  ],
  SUPPORT: [
    NotificationType.SUPPORT_TICKET_AANGEMAAKT,
    NotificationType.SUPPORT_TICKET_REACTIE,
    NotificationType.SUPPORT_TICKET_STATUS,
  ],
};

/** De NotificationTypes die bij een model horen (lege array bij onbekend). */
export function getTypesForModel(
  model: NotificationModel,
): NotificationType[] {
  return NOTIFICATION_MODEL_TYPES[model] ?? [];
}
