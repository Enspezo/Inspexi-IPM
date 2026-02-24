import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ContactPersonRole, ContactType, Role } from '@/types';
import { Button, Card, Spinner, useToast } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { useAuth } from '@/providers/auth-provider';
import {
  useContactPerson,
  useUpdateContactPerson,
  useDeleteContactPerson,
} from './hooks/use-contacts';
import { AuditHistory } from '@/components/audit-history/audit-history';

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE];

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

export default function ContactPersonDetailPage() {
  const { personId } = useParams<{ personId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data: person, isLoading, error } = useContactPerson(personId!);
  const deleteMutation = useDeleteContactPerson();

  const userCanWrite = user && canWrite.includes(user.role);

  const handleDelete = async () => {
    if (!person) return;
    if (!window.confirm('Weet u zeker dat u deze contactpersoon wilt verwijderen?')) return;
    try {
      await deleteMutation.mutateAsync(person.id);
      showToast('Contactpersoon verwijderd', 'success');
      navigate(`/contacts/${person.contactId}`);
    } catch {
      showToast('Verwijderen mislukt', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !person) {
    return (
      <div className="rounded-lg bg-danger-50 p-4 text-sm text-danger-600">
        {error?.message || 'Contactpersoon niet gevonden'}
      </div>
    );
  }

  const contactName = person.contact
    ? person.contact.type === ContactType.COMPANY
      ? person.contact.companyName || '—'
      : [person.contact.firstName, person.contact.lastName].filter(Boolean).join(' ') || '—'
    : '—';

  return (
    <DetailPageLayout sidebar={<AuditHistory entityType="ContactPerson" entityId={personId} />}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/contacts/${person.contactId}`)}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900">
                {person.firstName} {person.lastName}
              </h2>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  roleColors[person.role] || 'bg-gray-100 text-gray-800'
                }`}
              >
                {roleLabels[person.role] || person.role}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-gray-500">
              Contactpersoon van{' '}
              <button
                onClick={() => navigate(`/contacts/${person.contactId}`)}
                className="text-primary-600 hover:underline"
              >
                {contactName}
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Details */}
      <Card>
        <div className="grid grid-cols-2 gap-6">
          <InfoField label="Voornaam" value={person.firstName} />
          <InfoField label="Achternaam" value={person.lastName} />
          <InfoField label="E-mail" value={person.email} />
          <InfoField label="Telefoon" value={person.phone} />
          <InfoField label="Rol" value={roleLabels[person.role] || person.role} />
          <div className="col-span-2">
            <InfoField label="Notities" value={person.notes} />
          </div>
        </div>
      </Card>

      {/* Verwijderen */}
      {userCanWrite && (
        <div className="flex justify-end border-t border-gray-200 pt-6">
          <Button variant="danger" size="sm" onClick={handleDelete}>
            Contactpersoon verwijderen
          </Button>
        </div>
      )}
    </div>
    </DetailPageLayout>
  );
}

function InfoField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value || '—'}</dd>
    </div>
  );
}
