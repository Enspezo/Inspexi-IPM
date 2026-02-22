import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Contact } from '@/types';
import { ContactType } from '@/types';
import {
  Button,
  Spinner,
  Table,
  Input,
  Select,
  type Column,
} from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import { Role } from '@/types';
import { useContacts } from './hooks/use-contacts';
import { CreateContactModal } from './components/create-contact-modal';

const typeFilterOptions = [
  { value: '', label: 'Alle types' },
  { value: ContactType.COMPANY, label: 'Bedrijf' },
  { value: ContactType.INDIVIDUAL, label: 'Particulier' },
];

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE];

function getContactDisplayName(contact: Contact): string {
  if (contact.type === ContactType.COMPANY) {
    return contact.companyName || '—';
  }
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—';
}

function getContactCity(contact: Contact): string {
  const primary = contact.addresses?.find((a) => a.isPrimary);
  const first = contact.addresses?.[0];
  return primary?.city || first?.city || '—';
}

export default function ContactsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data, isLoading, error } = useContacts({
    search: search || undefined,
    type: (typeFilter as ContactType) || undefined,
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

  const userCanWrite = user && canWrite.includes(user.role);

  const columns: Column<Contact>[] = [
    {
      key: 'name',
      header: 'Naam',
      render: (contact) => (
        <button
          onClick={() => navigate(`/contacts/${contact.id}`)}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {getContactDisplayName(contact)}
        </button>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (contact) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            contact.type === ContactType.COMPANY
              ? 'bg-blue-100 text-blue-800'
              : 'bg-purple-100 text-purple-800'
          }`}
        >
          {contact.type === ContactType.COMPANY ? 'Bedrijf' : 'Particulier'}
        </span>
      ),
    },
    {
      key: 'email',
      header: 'E-mail',
      render: (contact) => (
        <span className="text-gray-600">{contact.email || '—'}</span>
      ),
    },
    {
      key: 'phone',
      header: 'Telefoon',
      render: (contact) => (
        <span className="text-gray-600">{contact.phone || '—'}</span>
      ),
    },
    {
      key: 'city',
      header: 'Stad',
      render: (contact) => (
        <span className="text-gray-600">{getContactCity(contact)}</span>
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
        Fout bij het laden van relaties: {error.message}
      </div>
    );
  }

  const contacts = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Relaties</h2>
          <p className="mt-1 text-sm text-gray-500">
            Beheer uw klanten en contacten
          </p>
        </div>
        {userCanWrite && (
          <Button onClick={() => setIsCreateOpen(true)}>
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Relatie aanmaken
          </Button>
        )}
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
            options={typeFilterOptions}
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <Table
        columns={columns}
        data={contacts}
        keyExtractor={(c) => c.id}
        emptyMessage="Geen relaties gevonden"
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {total} relatie{total !== 1 ? 's' : ''} gevonden
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

      <CreateContactModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
    </div>
  );
}
