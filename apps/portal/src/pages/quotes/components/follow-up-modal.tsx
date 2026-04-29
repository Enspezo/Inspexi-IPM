import { useState, useEffect } from 'react';
import { Button, Input, Select, Modal } from '@/components/ui';
import { FollowUpType, FollowUpAssigneeType, EmailTemplateType } from '@/types';
import type { QuoteTemplateFollowUp } from '@/types';
import { useUsers } from '@/pages/users/hooks/use-users';
import { useCreateEmailTemplate } from '@/pages/email-templates/hooks/use-email-templates';
import { LinkEmailTemplateModal } from './link-email-template-modal';

interface FollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: FollowUpFormData) => void;
  isSaving: boolean;
  templateName: string;
  followUp?: QuoteTemplateFollowUp | null;
  navigate: (path: string) => void;
}

export interface FollowUpFormData {
  type: FollowUpType;
  delayDays: number;
  isActive: boolean;
  emailTemplateId?: string | null;
  defaultNotes?: string;
  assigneeType: FollowUpAssigneeType;
  assigneeUserId?: string | null;
}

export function FollowUpModal({
  isOpen,
  onClose,
  onSave,
  isSaving,
  templateName,
  followUp,
  navigate,
}: FollowUpModalProps) {
  const { data: allUsers } = useUsers();
  const createEmailTemplateMutation = useCreateEmailTemplate();

  const [type, setType] = useState<FollowUpType>(FollowUpType.EMAIL);
  const [delayDays, setDelayDays] = useState(3);
  const [isActive, setIsActive] = useState(true);
  const [emailTemplateId, setEmailTemplateId] = useState<string | null>(null);
  const [emailTemplateName, setEmailTemplateName] = useState<string | null>(null);
  const [defaultNotes, setDefaultNotes] = useState('');
  const [assigneeType, setAssigneeType] = useState<FollowUpAssigneeType>(FollowUpAssigneeType.QUOTE_OWNER);
  const [assigneeUserId, setAssigneeUserId] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);

  const isEditing = !!followUp;

  useEffect(() => {
    if (isOpen) {
      if (followUp) {
        setType(followUp.type);
        setDelayDays(followUp.delayDays);
        setIsActive(followUp.isActive);
        setEmailTemplateId(followUp.emailTemplateId);
        setEmailTemplateName(followUp.emailTemplate?.name ?? null);
        setDefaultNotes(followUp.defaultNotes ?? '');
        setAssigneeType(followUp.assigneeType);
        setAssigneeUserId(followUp.assigneeUserId);
      } else {
        setType(FollowUpType.EMAIL);
        setDelayDays(3);
        setIsActive(true);
        setEmailTemplateId(null);
        setEmailTemplateName(null);
        setDefaultNotes('');
        setAssigneeType(FollowUpAssigneeType.QUOTE_OWNER);
        setAssigneeUserId(null);
      }
    }
  }, [isOpen, followUp]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      type,
      delayDays,
      isActive,
      emailTemplateId: type === FollowUpType.EMAIL ? emailTemplateId : null,
      defaultNotes: type === FollowUpType.TELEFOONGESPREK ? defaultNotes : undefined,
      assigneeType,
      assigneeUserId: assigneeType === FollowUpAssigneeType.SPECIFIC_USER ? assigneeUserId : null,
    });
  };

  const handleCreateEmailTemplate = async () => {
    const name = `Follow-up ${templateName}`;
    const result = await createEmailTemplateMutation.mutateAsync({
      type: EmailTemplateType.OFFERTE_FOLLOW_UP,
      name,
      subject: `Follow-up: ${templateName}`,
      bodyHtml: '<p>Voer hier uw follow-up bericht in.</p>',
    });
    setEmailTemplateId(result.id);
    setEmailTemplateName(result.name);
  };

  const handleLinkExisting = (id: string) => {
    setEmailTemplateId(id);
    // We don't have the name from the link modal, but we can update after refetch
    setEmailTemplateName('Gekoppeld sjabloon');
    setShowLinkModal(false);
  };

  const activeUsers = (allUsers ?? []).filter((u) => u.isActive);

  const assigneeOptions = [
    { value: FollowUpAssigneeType.SYSTEM, label: 'Systeem (automatisch)' },
    { value: FollowUpAssigneeType.QUOTE_OWNER, label: 'Eigenaar offerte' },
    { value: FollowUpAssigneeType.SPECIFIC_USER, label: 'Specifieke gebruiker' },
  ];

  const userOptions = activeUsers.map((u) => ({
    value: u.id,
    label: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
  }));

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={isEditing ? 'Follow-up bewerken' : 'Follow-up toevoegen'}
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Type */}
          <Select
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value as FollowUpType)}
            options={[
              { value: FollowUpType.EMAIL, label: 'E-mail' },
              { value: FollowUpType.TELEFOONGESPREK, label: 'Telefoongesprek' },
            ]}
          />

          {/* Delay days */}
          <Input
            label="Dagen na versturen"
            type="number"
            min={1}
            value={delayDays}
            onChange={(e) => setDelayDays(Math.max(1, parseInt(e.target.value) || 1))}
          />

          {/* Active toggle */}
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">Actief</span>
          </label>

          {/* EMAIL specific: email template */}
          {type === FollowUpType.EMAIL && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="mb-3 text-sm font-medium text-gray-700">E-mailsjabloon</p>
              {emailTemplateId ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                    <span className="text-sm text-gray-900">{emailTemplateName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {followUp?.emailTemplate && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate(`/email-templates/${emailTemplateId}`)}
                      >
                        Bewerken
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEmailTemplateId(null);
                        setEmailTemplateName(null);
                      }}
                    >
                      Ontkoppelen
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleCreateEmailTemplate}
                    isLoading={createEmailTemplateMutation.isPending}
                  >
                    Nieuw aanmaken
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowLinkModal(true)}
                  >
                    Bestaand koppelen
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* TELEFOONGESPREK specific: notes + assignee */}
          {type === FollowUpType.TELEFOONGESPREK && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Standaard notitie
                </label>
                <textarea
                  value={defaultNotes}
                  onChange={(e) => setDefaultNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="Notitie die als beschrijving bij de taak wordt gezet..."
                />
              </div>
            </>
          )}

          {/* Assignee — always shown */}
          <Select
            label="Toewijzen aan"
            value={assigneeType}
            onChange={(e) => {
              const val = e.target.value as FollowUpAssigneeType;
              setAssigneeType(val);
              if (val !== FollowUpAssigneeType.SPECIFIC_USER) {
                setAssigneeUserId(null);
              }
            }}
            options={assigneeOptions}
          />

          {assigneeType === FollowUpAssigneeType.SPECIFIC_USER && (
            <Select
              label="Gebruiker"
              value={assigneeUserId ?? ''}
              onChange={(e) => setAssigneeUserId(e.target.value || null)}
              options={userOptions}
              placeholder="Selecteer een gebruiker..."
            />
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Annuleren
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSaving}
              disabled={delayDays < 1}
            >
              {isEditing ? 'Opslaan' : 'Toevoegen'}
            </Button>
          </div>
        </form>
      </Modal>

      <LinkEmailTemplateModal
        isOpen={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        type={EmailTemplateType.OFFERTE_FOLLOW_UP}
        onSelect={handleLinkExisting}
      />
    </>
  );
}
