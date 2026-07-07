import { useState } from 'react';
import { Button, Spinner, useConfirm, useToast } from '@/components/ui';
import { FollowUpType, FollowUpAssigneeType } from '@/types';
import type { QuoteTemplateFollowUp } from '@/types';
import {
  useFollowUpRules,
  useCreateFollowUp,
  useUpdateFollowUp,
  useDeleteFollowUp,
} from '../hooks/use-quote-templates';
import { FollowUpModal } from './follow-up-modal';
import type { FollowUpFormData } from './follow-up-modal';
import { getErrorMessage } from '@/lib/api-client';

interface FollowUpSectionProps {
  templateId: string;
  templateName: string;
  userIsAdmin: boolean;
  navigate: (path: string) => void;
}

const ASSIGNEE_LABELS: Record<FollowUpAssigneeType, string> = {
  [FollowUpAssigneeType.SYSTEM]: 'Systeem (automatisch)',
  [FollowUpAssigneeType.QUOTE_OWNER]: 'Eigenaar offerte',
  [FollowUpAssigneeType.SPECIFIC_USER]: 'Specifieke gebruiker',
};

export function FollowUpSection({
  templateId,
  templateName,
  userIsAdmin,
  navigate,
}: FollowUpSectionProps) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { data: followUps, isLoading } = useFollowUpRules(templateId);
  const createMutation = useCreateFollowUp(templateId);
  const updateMutation = useUpdateFollowUp(templateId);
  const deleteMutation = useDeleteFollowUp(templateId);

  const [showModal, setShowModal] = useState(false);
  const [editingFollowUp, setEditingFollowUp] = useState<QuoteTemplateFollowUp | null>(null);

  const handleCreate = () => {
    setEditingFollowUp(null);
    setShowModal(true);
  };

  const handleEdit = (followUp: QuoteTemplateFollowUp) => {
    setEditingFollowUp(followUp);
    setShowModal(true);
  };

  const handleSave = async (data: FollowUpFormData) => {
    try {
      if (editingFollowUp) {
        await updateMutation.mutateAsync({ followUpId: editingFollowUp.id, data });
        showToast('Follow-up bijgewerkt', 'success');
      } else {
        await createMutation.mutateAsync(data);
        showToast('Follow-up toegevoegd', 'success');
      }
      setShowModal(false);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleDelete = async (followUpId: string) => {
    const confirmed = await confirm({
      title: 'Follow-up verwijderen',
      message: 'Weet u zeker dat u deze follow-up wilt verwijderen?',
      confirmLabel: 'Verwijderen',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(followUpId);
      showToast('Follow-up verwijderd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleToggleActive = async (followUp: QuoteTemplateFollowUp) => {
    try {
      await updateMutation.mutateAsync({
        followUpId: followUp.id,
        data: { isActive: !followUp.isActive },
      });
      showToast(followUp.isActive ? 'Follow-up uitgeschakeld' : 'Follow-up ingeschakeld', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* Header */}
        <div className="border-b border-gray-100 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Follow-ups</h3>
                <p className="text-sm text-gray-500">
                  Automatische taken die worden aangemaakt bij het versturen van een offerte.
                </p>
              </div>
            </div>
            {userIsAdmin && (
              <Button variant="primary" size="sm" onClick={handleCreate}>
                Toevoegen
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner size="md" />
            </div>
          ) : !followUps || followUps.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-500">
              Geen follow-ups ingesteld. Voeg een follow-up toe om automatisch taken aan te maken bij het versturen van een offerte.
            </div>
          ) : (
            <div className="space-y-3">
              {[...followUps].sort((a, b) => a.delayDays - b.delayDays).map((followUp) => (
                <FollowUpCard
                  key={followUp.id}
                  followUp={followUp}
                  userIsAdmin={userIsAdmin}
                  onEdit={() => handleEdit(followUp)}
                  onDelete={() => handleDelete(followUp.id)}
                  onToggleActive={() => handleToggleActive(followUp)}
                  navigate={navigate}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <FollowUpModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleSave}
        isSaving={createMutation.isPending || updateMutation.isPending}
        templateName={templateName}
        followUp={editingFollowUp}
        navigate={navigate}
      />
    </>
  );
}

function FollowUpCard({
  followUp,
  userIsAdmin,
  onEdit,
  onDelete,
  onToggleActive,
  navigate,
}: {
  followUp: QuoteTemplateFollowUp;
  userIsAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  navigate: (path: string) => void;
}) {
  const isEmail = followUp.type === FollowUpType.EMAIL;

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        followUp.isActive
          ? 'border-gray-200 bg-white'
          : 'border-gray-200 bg-gray-50'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          {/* Type icon */}
          <div
            className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
              followUp.isActive
                ? isEmail
                  ? 'bg-blue-100 text-blue-600'
                  : 'bg-green-100 text-green-600'
                : 'bg-gray-100 text-gray-400'
            }`}
          >
            {isEmail ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
              </svg>
            )}
          </div>

          {/* Content */}
          <div className={`min-w-0 ${!followUp.isActive ? 'opacity-60' : ''}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-900">
                {isEmail ? 'E-mail' : 'Telefoongesprek'}
              </span>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {followUp.delayDays} {followUp.delayDays === 1 ? 'dag' : 'dagen'} na versturen
              </span>
              {!followUp.isActive && (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 ring-1 ring-inset ring-amber-600/20">
                  Inactief
                </span>
              )}
            </div>

            {/* Email template info */}
            {isEmail && followUp.emailTemplate && (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-xs text-gray-500">Sjabloon:</span>
                <button
                  type="button"
                  onClick={() => navigate(`/email-templates/${followUp.emailTemplateId}`)}
                  className="text-xs font-medium text-primary-600 hover:text-primary-700"
                >
                  {followUp.emailTemplate.name}
                </button>
              </div>
            )}

            {isEmail && !followUp.emailTemplate && (
              <p className="mt-1 text-xs text-amber-600">Geen e-mailsjabloon gekoppeld</p>
            )}

            {/* Phone call info */}
            {!isEmail && followUp.defaultNotes && (
              <p className="mt-1 truncate text-xs text-gray-500">
                Notitie: {followUp.defaultNotes}
              </p>
            )}

            {/* Assignee info */}
            <div className="mt-1 flex items-center gap-1">
              <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
              <span className="text-xs text-gray-500">
                {followUp.assigneeType === FollowUpAssigneeType.SPECIFIC_USER && followUp.assigneeUser
                  ? `${followUp.assigneeUser.firstName ?? ''} ${followUp.assigneeUser.lastName ?? ''}`.trim() || followUp.assigneeUser.email
                  : ASSIGNEE_LABELS[followUp.assigneeType]}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        {userIsAdmin && (
          <div className="flex flex-shrink-0 items-center gap-1">
            {/* Toggle active */}
            <button
              type="button"
              role="switch"
              aria-checked={followUp.isActive}
              onClick={onToggleActive}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                followUp.isActive ? 'bg-primary-600' : 'bg-gray-200'
              }`}
              title={followUp.isActive ? 'Uitschakelen' : 'Inschakelen'}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  followUp.isActive ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>

            {/* Edit */}
            <button
              type="button"
              onClick={onEdit}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="Bewerken"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
              </svg>
            </button>

            {/* Delete */}
            <button
              type="button"
              onClick={onDelete}
              className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
              title="Verwijderen"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
