import { EmailTemplateType } from '@/types';

export const EMAIL_TYPE_LABELS: Record<EmailTemplateType, string> = {
  [EmailTemplateType.OFFERTE_VERSTUURD]: 'Offerte verstuurd',
  [EmailTemplateType.OFFERTE_ANTWOORD]: 'Offerte antwoord',
  [EmailTemplateType.AFSPRAAK_BEVESTIGING]: 'Afspraakbevestiging',
  [EmailTemplateType.AFSPRAAK_VERPLAATST]: 'Afspraak verplaatst',
  [EmailTemplateType.AFSPRAAK_ACCEPTATIE]: 'Afspraak acceptatie',
  [EmailTemplateType.CONTACT_EMAIL]: 'Contact e-mail',
  [EmailTemplateType.UITNODIGING]: 'Uitnodiging',
  [EmailTemplateType.WACHTWOORD_RESET]: 'Wachtwoord reset',
  [EmailTemplateType.NOTIFICATIE]: 'Notificatie',
};
