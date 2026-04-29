import { Modal, Spinner } from '@/components/ui';
import { useEmailTemplates } from '@/pages/email-templates/hooks/use-email-templates';
import type { EmailTemplateType } from '@/types';

interface LinkEmailTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: EmailTemplateType;
  onSelect: (id: string) => void;
}

export function LinkEmailTemplateModal({
  isOpen,
  onClose,
  type,
  onSelect,
}: LinkEmailTemplateModalProps) {
  const { data, isLoading } = useEmailTemplates({ type, isActive: true });
  const templates = data?.data ?? [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="E-mailsjabloon koppelen">
      <div className="space-y-3">
        <p className="text-sm text-gray-500">
          Selecteer een bestaand e-mailsjabloon om te koppelen aan dit offertesjabloon.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size="md" />
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
            Geen actieve e-mailsjablonen van dit type gevonden. Maak eerst een nieuw sjabloon aan.
          </div>
        ) : (
          <div className="max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => {
                  onSelect(tpl.id);
                  onClose();
                }}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-gray-50"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{tpl.name}</p>
                  <p className="text-xs text-gray-500">Onderwerp: {tpl.subject}</p>
                </div>
                <svg
                  className="h-4 w-4 flex-shrink-0 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
