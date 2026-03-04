import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ContactPersonRole } from '@/types';
import type { ContactPerson } from '@/types';
import {
  ActionMenu,
  Spinner,
  Button,
  Input,
  Select,
  Table,
  type Column,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { useContactPersons } from './hooks/use-contacts';
import { CreateContactPersonModal } from './components/create-contact-person-modal';

const roleFilterOptions = [
  { value: '', label: 'Alle rollen' },
  { value: ContactPersonRole.ALGEMEEN, label: 'Algemeen' },
  { value: ContactPersonRole.TECHNISCH, label: 'Technisch' },
  { value: ContactPersonRole.ADMINISTRATIEF, label: 'Administratief' },
  { value: ContactPersonRole.ANDERS, label: 'Anders' },
];

const roleLabels: Record<string, string> = {
  [ContactPersonRole.ALGEMEEN]: 'Algemeen',
  [ContactPersonRole.TECHNISCH]: 'Technisch',
  [ContactPersonRole.ADMINISTRATIEF]: 'Administratief',
  [ContactPersonRole.ANDERS]: 'Anders',
};

const roleColors: Record<string, string> = {
  [ContactPersonRole.ALGEMEEN]: 'bg-blue-100 text-blue-800',
  [ContactPersonRole.TECHNISCH]: 'bg-orange-100 text-orange-800',
  [ContactPersonRole.ADMINISTRATIEF]: 'bg-green-100 text-green-800',
  [ContactPersonRole.ANDERS]: 'bg-gray-100 text-gray-800',
};

function getContactName(contact?: {
  type?: string;
  companyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  if (!contact) return '—';
  if (contact.companyName) return contact.companyName;
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—';
}

export default function ContactPersonsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data, isLoading, error } = useContactPersons({
    search: search || undefined,
    role: (roleFilter as ContactPersonRole) || undefined,
    page,
    limit: 20,
  });

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
      setPage(1);
    },
    [],
  );

  const columns: Column<ContactPerson>[] = [
    {
      key: 'name',
      header: 'Naam',
      render: (person) => (
        <button
          onClick={() => navigate(`/contacts/persons/${person.id}`)}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {person.firstName} {person.lastName}
        </button>
      ),
    },
    {
      key: 'role',
      header: 'Rol',
      render: (person) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            roleColors[person.role] || 'bg-gray-100 text-gray-800'
          }`}
        >
          {roleLabels[person.role] || person.role}
        </span>
      ),
    },
    {
      key: 'email',
      header: 'E-mail',
      render: (person) => (
        <span className="text-gray-600">{person.email || '—'}</span>
      ),
    },
    {
      key: 'phone',
      header: 'Telefoon',
      render: (person) => (
        <span className="text-gray-600">{person.phone || '—'}</span>
      ),
    },
    {
      key: 'contact',
      header: 'Relatie',
      render: (person) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/contacts/${person.contactId}`);
          }}
          className="text-sm text-primary-600 hover:text-primary-800 hover:underline"
        >
          {getContactName((person as any).contact)}
        </button>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-danger-50 p-4 text-sm text-danger-600">
        Fout bij het laden van contactpersonen: {error.message}
      </div>
    );
  }

  const persons = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <>
    <DetailPageLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Contactpersonen</h2>
            <p className="mt-1 text-sm text-gray-500">
              Overzicht van alle contactpersonen
            </p>
          </div>
          <ActionMenu
            secondaryActions={[
              {
                label: 'Nieuw contactpersoon',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>,
                onClick: () => setIsCreateOpen(true),
              },
            ]}
          />
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <Input
              placeholder="Zoeken op naam, e-mail..."
              value={search}
              onChange={handleSearchChange}
            />
          </div>
          <div className="w-48">
            <Select
              options={roleFilterOptions}
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        <Table
          columns={columns}
          data={persons}
          keyExtractor={(p) => p.id}
          emptyMessage="Geen contactpersonen gevonden"
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {total} contactperso{total !== 1 ? 'nen' : 'on'} gevonden
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Vorige
              </Button>
              <span className="flex items-center px-3 text-sm text-gray-600">
                {page} / {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Volgende
              </Button>
            </div>
          </div>
        )}
      </div>
      </DetailPageLayout>

      <CreateContactPersonModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
    </>
  );
}
