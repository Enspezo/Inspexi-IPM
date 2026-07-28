import { EmailTemplateType } from '@/types';
import type { QuoteTemplate } from '@/types';
import type { useUpdateQuoteTemplate } from '../hooks/use-quote-templates';
import type { useCreateEmailTemplate } from '@/pages/email-templates/hooks/use-email-templates';
import { EmailTemplateSection } from './quote-template-email-template-section';
import { FollowUpSection } from './follow-up-section';
import { getErrorMessage } from '@/lib/api-client';

// ── Automatisering tab (shared) ────────────────────────

export function AutomationTab({
  template,
  templateId,
  name,
  userIsAdmin,
  updateMutation,
  createEmailTemplateMutation,
  showToast,
  navigate,
  setLinkModalType,
  setLinkModalField,
  setLinkModalOpen,
}: {
  template: QuoteTemplate;
  templateId: string;
  name: string;
  userIsAdmin: boolean;
  updateMutation: ReturnType<typeof useUpdateQuoteTemplate>;
  createEmailTemplateMutation: ReturnType<typeof useCreateEmailTemplate>;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  navigate: (path: string) => void;
  setLinkModalType: (type: EmailTemplateType) => void;
  setLinkModalField: (field: 'sendEmailTemplateId' | 'acceptedEmailTemplateId') => void;
  setLinkModalOpen: (open: boolean) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Section 1: E-mail bij versturen */}
      <EmailTemplateSection
        title="E-mail bij versturen"
        description="Dit e-mailsjabloon wordt gebruikt wanneer een offerte op basis van dit template wordt verstuurd naar de klant."
        linkedTemplate={template.sendEmailTemplate}
        isEnabled={template.sendEmailEnabled}
        templateName={name}
        emailType={EmailTemplateType.OFFERTE_VERSTUURD}
        defaultNamePrefix="Offerte verstuurd"
        userIsAdmin={!!userIsAdmin}
        onUnlink={async () => {
          try {
            await updateMutation.mutateAsync({ sendEmailTemplateId: null });
            showToast('E-mailsjabloon ontkoppeld', 'success');
          } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
        }}
        onCreate={async () => {
          try {
            const created = await createEmailTemplateMutation.mutateAsync({
              type: EmailTemplateType.OFFERTE_VERSTUURD,
              name: `Offerte verstuurd - ${name}`,
              subject: `Offerte {{offerte.nummer}}`,
              bodyHtml: '<p>Geachte {{contact.voornaam}} {{contact.achternaam}},</p><p>Hierbij ontvangt u onze offerte.</p>',
            });
            await updateMutation.mutateAsync({ sendEmailTemplateId: created.id });
            showToast('E-mailsjabloon aangemaakt en gekoppeld', 'success');
            navigate(`/email-templates/${created.id}`);
          } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
        }}
        onLinkExisting={() => {
          setLinkModalType(EmailTemplateType.OFFERTE_VERSTUURD);
          setLinkModalField('sendEmailTemplateId');
          setLinkModalOpen(true);
        }}
        onToggleEnabled={async (enabled) => {
          try {
            await updateMutation.mutateAsync({ sendEmailEnabled: enabled });
            showToast(enabled ? 'E-mailsjabloon ingeschakeld' : 'E-mailsjabloon uitgeschakeld', 'success');
          } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
        }}
        isCreating={createEmailTemplateMutation.isPending}
        isUnlinking={updateMutation.isPending}
        navigate={navigate}
      />

      {/* Section 2: Follow-ups */}
      <FollowUpSection
        templateId={templateId}
        templateName={name}
        userIsAdmin={!!userIsAdmin}
        navigate={navigate}
      />

      {/* Section 3: E-mail bij acceptatie */}
      <EmailTemplateSection
        title="E-mail bij acceptatie"
        description="Dit e-mailsjabloon wordt als bevestiging gestuurd wanneer de klant een offerte ondertekent en accepteert."
        linkedTemplate={template.acceptedEmailTemplate}
        isEnabled={template.acceptedEmailEnabled}
        templateName={name}
        emailType={EmailTemplateType.OFFERTE_GEACCEPTEERD}
        defaultNamePrefix="Offerte geaccepteerd"
        userIsAdmin={!!userIsAdmin}
        onUnlink={async () => {
          try {
            await updateMutation.mutateAsync({ acceptedEmailTemplateId: null });
            showToast('E-mailsjabloon ontkoppeld', 'success');
          } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
        }}
        onCreate={async () => {
          try {
            const created = await createEmailTemplateMutation.mutateAsync({
              type: EmailTemplateType.OFFERTE_GEACCEPTEERD,
              name: `Offerte geaccepteerd - ${name}`,
              subject: `Bevestiging ondertekening offerte {{offerte.nummer}}`,
              bodyHtml: '<p>Geachte {{contact.voornaam}} {{contact.achternaam}},</p><p>Hierbij ontvangt u de bevestiging van uw ondertekening.</p>',
            });
            await updateMutation.mutateAsync({ acceptedEmailTemplateId: created.id });
            showToast('E-mailsjabloon aangemaakt en gekoppeld', 'success');
            navigate(`/email-templates/${created.id}`);
          } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
        }}
        onLinkExisting={() => {
          setLinkModalType(EmailTemplateType.OFFERTE_GEACCEPTEERD);
          setLinkModalField('acceptedEmailTemplateId');
          setLinkModalOpen(true);
        }}
        onToggleEnabled={async (enabled) => {
          try {
            await updateMutation.mutateAsync({ acceptedEmailEnabled: enabled });
            showToast(enabled ? 'E-mailsjabloon ingeschakeld' : 'E-mailsjabloon uitgeschakeld', 'success');
          } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
        }}
        isCreating={createEmailTemplateMutation.isPending}
        isUnlinking={updateMutation.isPending}
        navigate={navigate}
      />
    </div>
  );
}
