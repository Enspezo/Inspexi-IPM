import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { roleColors } from '@/lib/contact-person-role';
import type { Contact } from '@/types';

const contactPersonRoleColors = roleColors;

export function ContactPersonsSection({
  contact,
  userCanWrite,
  onAdd,
}: {
  contact: Contact;
  userCanWrite: boolean;
  onAdd: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          Contactpersonen
        </h3>
        {userCanWrite && (
          <Button size="sm" onClick={onAdd}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Contactpersoon toevoegen
          </Button>
        )}
      </div>
      {(contact.contactPersons?.length || 0) === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">
          Nog geen contactpersonen toegevoegd
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Naam
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Rol
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  E-mail
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Telefoon
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {contact.contactPersons?.map((person) => (
                <tr
                  key={person.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => navigate(`/contacts/persons/${person.id}`)}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                    {person.firstName} {person.lastName}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        contactPersonRoleColors[person.role?.code ?? ''] || 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {person.role?.label || '—'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {person.email || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                    {person.phone || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
