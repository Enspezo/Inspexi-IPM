import { useNavigate } from 'react-router-dom';
import { DropdownMenu, type ActionMenuItem } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import { useQuickCreate, type QuickCreateFlow } from '@/providers/quick-create-provider';
import { hasRole } from '@/lib/has-role';
import { Role } from '@/types';

// Write roles mirror the per-resource `canWrite` checks on the overview pages
// (contacts / requests / quotes). Projects additionally allow WERKVOORBEREIDER.
const CRM_WRITE_ROLES = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE];
const PROJECT_WRITE_ROLES = [...CRM_WRITE_ROLES, Role.WERKVOORBEREIDER];

type QuickCreateAction =
  | { type: 'flow'; flow: QuickCreateFlow }
  | { type: 'navigate'; to: string };

interface QuickCreateDef {
  key: string;
  label: string;
  /** Roles allowed to create this; `null` = visible to everyone (matches the
   *  contactpersoon/locatie overview pages, which have no role check). */
  roles: Role[] | null;
  action: QuickCreateAction;
}

// Order is intentional and matches the spec.
export const QUICK_CREATE_DEFS: QuickCreateDef[] = [
  { key: 'contact', label: 'Nieuwe relatie', roles: CRM_WRITE_ROLES, action: { type: 'flow', flow: 'contact' } },
  { key: 'contactPerson', label: 'Nieuwe contactpersoon', roles: null, action: { type: 'flow', flow: 'contactPerson' } },
  { key: 'location', label: 'Nieuwe locatie', roles: null, action: { type: 'flow', flow: 'location' } },
  { key: 'request', label: 'Nieuwe aanvraag', roles: CRM_WRITE_ROLES, action: { type: 'flow', flow: 'request' } },
  { key: 'quote', label: 'Nieuwe offerte', roles: CRM_WRITE_ROLES, action: { type: 'navigate', to: '/quotes/new' } },
  { key: 'project', label: 'Nieuw project', roles: PROJECT_WRITE_ROLES, action: { type: 'flow', flow: 'project' } },
];

const PlusIcon = (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);

export function QuickCreateButton() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { open } = useQuickCreate();

  const items: ActionMenuItem[] = QUICK_CREATE_DEFS.filter(
    (def) => def.roles === null || hasRole(user, def.roles),
  ).map((def) => ({
    label: def.label,
    icon: PlusIcon,
    onClick: () =>
      def.action.type === 'flow' ? open(def.action.flow) : navigate(def.action.to),
  }));

  // Nothing the user may create → hide the button entirely.
  if (items.length === 0) return null;

  return (
    <DropdownMenu
      actions={items}
      actionVariant="secondary"
      align="left"
      renderTrigger={({ isOpen, buttonProps }) => (
        <button
          {...buttonProps}
          aria-label="Nieuw aanmaken"
          title="Nieuw aanmaken"
          className="flex h-10 items-center gap-1.5 rounded-lg bg-primary-600 pl-2.5 pr-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
        >
          <svg
            className={`h-6 w-6 transition-transform duration-200 ${isOpen ? 'rotate-45' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span>Nieuw</span>
        </button>
      )}
    />
  );
}
