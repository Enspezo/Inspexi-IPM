import { Button } from '@/components/ui';
import { EmailTemplateType } from '@/types';

// ── Email Template Section (Automatisering tab) ──────────

export function EmailTemplateSection({
  title,
  description,
  linkedTemplate,
  isEnabled,
  templateName,
  emailType,
  defaultNamePrefix,
  userIsAdmin,
  onUnlink,
  onCreate,
  onLinkExisting,
  onToggleEnabled,
  isCreating,
  isUnlinking,
  navigate,
}: {
  title: string;
  description: string;
  linkedTemplate?: { id: string; name: string; type: string; subject: string; isActive: boolean } | null;
  isEnabled: boolean;
  templateName: string;
  emailType: EmailTemplateType;
  defaultNamePrefix: string;
  userIsAdmin: boolean;
  onUnlink: () => void;
  onCreate: () => void;
  onLinkExisting: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  isCreating: boolean;
  isUnlinking: boolean;
  navigate: (path: string) => void;
}) {
  return (
    <div className={`rounded-xl border shadow-sm ${linkedTemplate && !isEnabled ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white'}`}>
      <div className="border-b border-gray-100 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${linkedTemplate && !isEnabled ? 'bg-gray-200 text-gray-400' : 'bg-primary-100 text-primary-600'}`}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-500">{description}</p>
            </div>
          </div>
          {/* Toggle switch — only shown when a template is linked */}
          {linkedTemplate && userIsAdmin && (
            <button
              type="button"
              role="switch"
              aria-checked={isEnabled}
              onClick={() => onToggleEnabled(!isEnabled)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                isEnabled ? 'bg-primary-600' : 'bg-gray-200'
              }`}
            >
              <span className="sr-only">{isEnabled ? 'Uitschakelen' : 'Inschakelen'}</span>
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          )}
        </div>
      </div>

      <div className="px-6 py-4">
        {linkedTemplate ? (
          <div>
            {!isEnabled && (
              <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 ring-1 ring-inset ring-amber-600/20">
                Dit e-mailsjabloon is uitgeschakeld voor dit offertesjabloon. De standaard e-mail wordt gebruikt.
              </div>
            )}
            <div className={`flex items-center justify-between ${!isEnabled ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{linkedTemplate.name}</p>
                  <p className="text-xs text-gray-500">Onderwerp: {linkedTemplate.subject}</p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    linkedTemplate.isActive
                      ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20'
                      : 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-500/20'
                  }`}
                >
                  {linkedTemplate.isActive ? 'Actief' : 'Inactief'}
                </span>
              </div>
              {userIsAdmin && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/email-templates/${linkedTemplate.id}`)}
                  >
                    Bewerken
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onUnlink}
                    isLoading={isUnlinking}
                  >
                    Ontkoppelen
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500 mb-4">
              Geen e-mailsjabloon gekoppeld. De standaard e-mail wordt gebruikt.
            </p>
            {userIsAdmin && (
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onCreate}
                  isLoading={isCreating}
                >
                  E-mailsjabloon aanmaken
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onLinkExisting}
                >
                  Bestaand sjabloon koppelen
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
