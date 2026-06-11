import { useNavigate } from 'react-router-dom';
import { Spinner, useToast } from '@/components/ui';
import type { Contact } from '@/types';
import { useCustomerGroupsCompact } from '@/pages/customer-groups/hooks/use-customer-groups';
import { useSetContactGroups } from '../hooks/use-contacts';

export function ContactCustomerGroups({
  contactId,
  contact,
  userCanWrite,
}: {
  contactId: string;
  contact: Contact;
  userCanWrite: boolean;
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { data: allGroups, isLoading: groupsLoading } = useCustomerGroupsCompact();
  const setGroupsMutation = useSetContactGroups(contactId);

  const assignedIds = new Set(
    (contact.customerGroups || []).map((cg) => cg.customerGroupId),
  );

  const handleToggle = async (groupId: string) => {
    const newIds = assignedIds.has(groupId)
      ? [...assignedIds].filter((id) => id !== groupId)
      : [...assignedIds, groupId];
    try {
      await setGroupsMutation.mutateAsync(newIds);
    } catch {
      showToast('Klantgroepen bijwerken mislukt', 'error');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Klantgroepen</h3>
      </div>
      {groupsLoading ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      ) : !allGroups || allGroups.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">
          Er zijn nog geen klantgroepen aangemaakt
        </p>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap gap-3">
            {allGroups.map((group) => {
              const isAssigned = assignedIds.has(group.id);
              return (
                <label
                  key={group.id}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    isAssigned
                      ? 'border-primary-300 bg-primary-50 text-primary-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  } ${!userCanWrite ? 'pointer-events-none opacity-75' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isAssigned}
                    disabled={!userCanWrite || setGroupsMutation.isPending}
                    onChange={() => handleToggle(group.id)}
                  />
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded border ${
                      isAssigned
                        ? 'border-primary-600 bg-primary-600 text-white'
                        : 'border-gray-300 bg-white'
                    }`}
                  >
                    {isAssigned && (
                      <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                        <path
                          d="M2 6l3 3 5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span
                    className="cursor-pointer hover:underline"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigate(`/contacts/groups/${group.id}`);
                    }}
                  >
                    {group.name}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
