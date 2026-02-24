import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ContactType, ContactPersonRole, LogType, QuoteStatus, Role, TaskEntityType } from '@/types';
import type { Contact, ContactAddress, ContactLog, ContactEmail, Location } from '@/types';
import { Button, Card, Spinner, useToast } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { useAuth } from '@/providers/auth-provider';
import { useContact, useUpdateContact, useDeleteContact, useSetContactGroups, useDeleteAddress, useDeleteLocation } from './hooks/use-contacts';
import { useCustomerGroupsCompact } from '@/pages/customer-groups/hooks/use-customer-groups';
import { useUsers } from '@/pages/users/hooks/use-users';
import { AddAddressModal } from './components/add-address-modal';
import { EditAddressModal } from './components/edit-address-modal';
import { AddContactPersonModal } from './components/add-contact-person-modal';
import { AddLocationModal } from './components/add-location-modal';
import { EditLocationModal } from './components/edit-location-modal';
import { AddLogModal } from './components/add-log-modal';
import { SendEmailModal } from './components/send-email-modal';
import { AuditHistory } from '@/components/audit-history/audit-history';
import { CreateTaskModal } from '@/pages/tasks/components/create-task-modal';

type Tab = 'algemeen' | 'adressen' | 'locaties' | 'offertes' | 'geschiedenis';

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE];

function getContactDisplayName(contact: Contact): string {
  if (contact.type === ContactType.COMPANY) {
    return contact.companyName || '—';
  }
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const logTypeLabels: Record<string, string> = {
  [LogType.EMAIL]: 'E-mail',
  [LogType.PHONE]: 'Telefoon',
  [LogType.MEETING]: 'Vergadering',
  [LogType.NOTE]: 'Notitie',
};

const logTypeColors: Record<string, string> = {
  [LogType.EMAIL]: 'bg-blue-100 text-blue-800',
  [LogType.PHONE]: 'bg-green-100 text-green-800',
  [LogType.MEETING]: 'bg-purple-100 text-purple-800',
  [LogType.NOTE]: 'bg-gray-100 text-gray-800',
};

const contactPersonRoleLabels: Record<string, string> = {
  [ContactPersonRole.ALGEMEEN]: 'Algemeen',
  [ContactPersonRole.TECHNISCH]: 'Technisch',
  [ContactPersonRole.ADMINISTRATIEF]: 'Administratief',
  [ContactPersonRole.ANDERS]: 'Anders',
};

const contactPersonRoleColors: Record<string, string> = {
  [ContactPersonRole.ALGEMEEN]: 'bg-blue-100 text-blue-800',
  [ContactPersonRole.TECHNISCH]: 'bg-orange-100 text-orange-800',
  [ContactPersonRole.ADMINISTRATIEF]: 'bg-green-100 text-green-800',
  [ContactPersonRole.ANDERS]: 'bg-gray-100 text-gray-800',
};

const quoteStatusLabels: Record<string, string> = {
  [QuoteStatus.CONCEPT]: 'Concept',
  [QuoteStatus.TER_GOEDKEURING]: 'Ter goedkeuring',
  [QuoteStatus.GOEDGEKEURD]: 'Goedgekeurd',
  [QuoteStatus.VERSTUURD]: 'Verstuurd',
  [QuoteStatus.BEKEKEN]: 'Bekeken',
  [QuoteStatus.GEACCEPTEERD]: 'Geaccepteerd',
  [QuoteStatus.AFGEWEZEN]: 'Afgewezen',
  [QuoteStatus.VERLOPEN]: 'Verlopen',
};

const quoteStatusColors: Record<string, string> = {
  [QuoteStatus.CONCEPT]: 'bg-gray-100 text-gray-800',
  [QuoteStatus.TER_GOEDKEURING]: 'bg-yellow-100 text-yellow-800',
  [QuoteStatus.GOEDGEKEURD]: 'bg-green-100 text-green-800',
  [QuoteStatus.VERSTUURD]: 'bg-blue-100 text-blue-800',
  [QuoteStatus.BEKEKEN]: 'bg-purple-100 text-purple-800',
  [QuoteStatus.GEACCEPTEERD]: 'bg-emerald-100 text-emerald-800',
  [QuoteStatus.AFGEWEZEN]: 'bg-red-100 text-red-800',
  [QuoteStatus.VERLOPEN]: 'bg-orange-100 text-orange-800',
};

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data: contact, isLoading, error } = useContact(id!);
  const updateMutation = useUpdateContact(id!);
  const deleteMutation = useDeleteContact();

  const deleteAddressMutation = useDeleteAddress(id!);
  const deleteLocationMutation = useDeleteLocation(id!);

  const [activeTab, setActiveTab] = useState<Tab>('algemeen');
  const [isAddressOpen, setIsAddressOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<ContactAddress | null>(null);
  const [isContactPersonOpen, setIsContactPersonOpen] = useState(false);
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [isTaskOpen, setIsTaskOpen] = useState(false);

  const userCanWrite = user && canWrite.includes(user.role);

  // Eigenaar, ORG_ADMIN of SUPERUSER mag eigenaar wijzigen en relatie verwijderen
  const userCanManage =
    user &&
    (user.role === Role.SUPERUSER ||
      user.role === Role.ORG_ADMIN ||
      (contact?.ownerId != null && contact.ownerId === user.id));

  const handleDelete = async () => {
    if (!contact) return;
    if (!window.confirm('Weet u zeker dat u deze relatie wilt verwijderen?')) return;
    try {
      await deleteMutation.mutateAsync(contact.id);
      showToast('Relatie verwijderd', 'success');
      navigate('/contacts');
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

  if (error || !contact) {
    return (
      <div className="rounded-lg bg-danger-50 p-4 text-sm text-danger-600">
        {error?.message || 'Relatie niet gevonden'}
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'algemeen', label: 'Algemeen' },
    { key: 'adressen', label: `Adressen (${contact.addresses?.length || 0})` },
    { key: 'locaties', label: `Locaties (${contact.locations?.length || 0})` },
    { key: 'offertes', label: `Offertes (${contact.quotes?.length || 0})` },
    { key: 'geschiedenis', label: 'Geschiedenis' },
  ];

  // Merge logs + emails into timeline
  const timeline: Array<
    | (ContactLog & { _kind: 'log' })
    | (ContactEmail & { _kind: 'email' })
  > = [
    ...(contact.logs || []).map((l) => ({ ...l, _kind: 'log' as const })),
    ...(contact.emails || []).map((e) => ({ ...e, _kind: 'email' as const })),
  ].sort((a, b) => {
    const dateA = a._kind === 'log' ? a.loggedAt : a.sentAt;
    const dateB = b._kind === 'log' ? b.loggedAt : b.sentAt;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  return (
    <DetailPageLayout sidebar={<AuditHistory entityType="Contact" entityId={id} />}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/contacts')}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900">
                {getContactDisplayName(contact)}
              </h2>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  contact.type === ContactType.COMPANY
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-purple-100 text-purple-800'
                }`}
              >
                {contact.type === ContactType.COMPANY ? 'Bedrijf' : 'Particulier'}
              </span>
            </div>
            {contact.email && (
              <p className="mt-0.5 text-sm text-gray-500">{contact.email}</p>
            )}
          </div>
        </div>
        {userCanWrite && (
          <Button variant="secondary" size="sm" onClick={() => setIsTaskOpen(true)}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            Taak aanmaken
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'algemeen' && (
        <div className="space-y-6">
          <Card>
            <div className="grid grid-cols-2 gap-6">
              {contact.type === ContactType.COMPANY && (
                <>
                  <InfoField label="Bedrijfsnaam" value={contact.companyName} />
                  <InfoField label="KvK-nummer" value={contact.cocNumber} />
                  <InfoField label="BTW-nummer" value={contact.vatNumber} />
                  <InfoField label="Website" value={contact.website} />
                </>
              )}
              {contact.type === ContactType.INDIVIDUAL && (
                <>
                  <InfoField label="Voornaam" value={contact.firstName} />
                  <InfoField label="Achternaam" value={contact.lastName} />
                </>
              )}
              <InfoField label="E-mail" value={contact.email} />
              <InfoField label="Telefoon" value={contact.phone} />
              <OwnerSelect
                currentOwnerId={contact.ownerId}
                ownerName={
                  contact.owner
                    ? `${contact.owner.firstName} ${contact.owner.lastName}`
                    : null
                }
                canEdit={!!userCanManage}
                onSave={async (ownerId) => {
                  try {
                    await updateMutation.mutateAsync({ ownerId: ownerId || undefined });
                    showToast('Eigenaar bijgewerkt', 'success');
                  } catch {
                    showToast('Eigenaar bijwerken mislukt', 'error');
                  }
                }}
                isSaving={updateMutation.isPending}
              />
              <div className="col-span-2">
                <InfoField label="Notities" value={contact.notes} />
              </div>
            </div>
          </Card>

          {/* Klantgroepen */}
          <ContactCustomerGroups contactId={contact.id} contact={contact} userCanWrite={!!userCanWrite} />

          {/* Contactpersonen */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Contactpersonen
              </h3>
              {userCanWrite && (
                <Button size="sm" onClick={() => setIsContactPersonOpen(true)}>
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
                              contactPersonRoleColors[person.role] || 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {contactPersonRoleLabels[person.role] || person.role}
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
        </div>
      )}

      {activeTab === 'adressen' && (
        <div className="space-y-4">
          {userCanWrite && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setIsAddressOpen(true)}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Adres toevoegen
              </Button>
            </div>
          )}
          {(contact.addresses?.length || 0) === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Nog geen adressen toegevoegd
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {contact.addresses?.map((addr) => (
                <Card key={addr.id}>
                  <div className="relative">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-sm font-medium text-gray-900">
                            {addr.label}
                          </span>
                          {addr.isPrimary && (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                              Primair
                            </span>
                          )}
                          {addr.isPostal && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                              Postadres
                            </span>
                          )}
                          {addr.isInvoice && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                              Factuuradres
                            </span>
                          )}
                        </div>
                      </div>
                      {userCanWrite && (
                        <CardMenu
                          onEdit={() => setEditingAddress(addr)}
                          onDelete={async () => {
                            if (!window.confirm('Weet u zeker dat u dit adres wilt verwijderen?')) return;
                            try {
                              await deleteAddressMutation.mutateAsync(addr.id);
                              showToast('Adres verwijderd', 'success');
                            } catch {
                              showToast('Verwijderen mislukt', 'error');
                            }
                          }}
                        />
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {addr.street} {addr.houseNumber}
                    </p>
                    <p className="text-sm text-gray-600">
                      {addr.postalCode} {addr.city}
                    </p>
                    <p className="text-sm text-gray-400">{addr.country}</p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'locaties' && (
        <div className="space-y-4">
          {userCanWrite && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setIsLocationOpen(true)}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Locatie toevoegen
              </Button>
            </div>
          )}
          {(contact.locations?.length || 0) === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Nog geen locaties toegevoegd
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {contact.locations?.map((loc) => (
                <Card key={loc.id}>
                  <div className="relative">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-sm font-medium text-gray-900">
                            {loc.name}
                          </span>
                          {loc.objectType && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                              {loc.objectType}
                            </span>
                          )}
                        </div>
                      </div>
                      {userCanWrite && (
                        <CardMenu
                          onEdit={() => setEditingLocation(loc)}
                          onDelete={async () => {
                            if (!window.confirm('Weet u zeker dat u deze locatie wilt verwijderen?')) return;
                            try {
                              await deleteLocationMutation.mutateAsync(loc.id);
                              showToast('Locatie verwijderd', 'success');
                            } catch {
                              showToast('Verwijderen mislukt', 'error');
                            }
                          }}
                        />
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {loc.street} {loc.houseNumber}
                    </p>
                    <p className="text-sm text-gray-600">
                      {loc.postalCode} {loc.city}
                    </p>
                    {loc.notes && (
                      <p className="mt-2 text-xs text-gray-400">{loc.notes}</p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'offertes' && (
        <div className="space-y-4">
          {userCanWrite && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => navigate(`/quotes/new?contactId=${contact.id}`)}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Offerte aanmaken
              </Button>
            </div>
          )}
          {(contact.quotes?.length || 0) === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Nog geen offertes voor deze relatie
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Nummer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Onderwerp
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                      Totaal
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Datum
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {contact.quotes?.map((quote) => (
                    <tr
                      key={quote.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => navigate(`/quotes/${quote.id}`)}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-primary-600">
                        {quote.quoteNumber}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {quote.subject}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            quoteStatusColors[quote.status] || 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {quoteStatusLabels[quote.status] || quote.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">
                        {new Intl.NumberFormat('nl-NL', {
                          style: 'currency',
                          currency: 'EUR',
                        }).format(quote.total)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {formatShortDate(quote.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'geschiedenis' && (
        <div className="space-y-4">
          {userCanWrite && (
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setIsLogOpen(true)}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Moment loggen
              </Button>
              <Button size="sm" onClick={() => setIsEmailOpen(true)}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                E-mail versturen
              </Button>
            </div>
          )}
          {timeline.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Nog geen contactgeschiedenis
            </p>
          ) : (
            <div className="space-y-3">
              {timeline.map((item) => {
                if (item._kind === 'log') {
                  return (
                    <Card key={`log-${item.id}`}>
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                logTypeColors[item.type] || 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {logTypeLabels[item.type] || item.type}
                            </span>
                            {item.subject && (
                              <span className="text-sm font-medium text-gray-900">
                                {item.subject}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-400">
                            {formatDate(item.loggedAt)}
                          </span>
                        </div>
                        {item.body && (
                          <p className="mt-2 text-sm text-gray-600">
                            {item.body}
                          </p>
                        )}
                        {item.user && (
                          <p className="mt-1 text-xs text-gray-400">
                            Door {item.user.firstName} {item.user.lastName}
                          </p>
                        )}
                      </div>
                    </Card>
                  );
                }

                // Email item
                return (
                  <Card key={`email-${item.id}`}>
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                            E-mail verstuurd
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            {item.subject}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400">
                          {formatDate(item.sentAt)}
                        </span>
                      </div>
                      {item.user && (
                        <p className="mt-1 text-xs text-gray-400">
                          Door {item.user.firstName} {item.user.lastName}
                        </p>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Verwijderen */}
      {userCanManage && (
        <div className="flex justify-end border-t border-gray-200 pt-6">
          <Button variant="danger" size="sm" onClick={handleDelete}>
            Relatie verwijderen
          </Button>
        </div>
      )}

      {/* Modals */}
      <AddAddressModal
        isOpen={isAddressOpen}
        onClose={() => setIsAddressOpen(false)}
        contactId={contact.id}
      />
      {editingAddress && (
        <EditAddressModal
          isOpen={!!editingAddress}
          onClose={() => setEditingAddress(null)}
          contactId={contact.id}
          address={editingAddress}
        />
      )}
      <AddContactPersonModal
        isOpen={isContactPersonOpen}
        onClose={() => setIsContactPersonOpen(false)}
        contactId={contact.id}
      />
      <AddLocationModal
        isOpen={isLocationOpen}
        onClose={() => setIsLocationOpen(false)}
        contactId={contact.id}
      />
      {editingLocation && (
        <EditLocationModal
          isOpen={!!editingLocation}
          onClose={() => setEditingLocation(null)}
          contactId={contact.id}
          location={editingLocation}
        />
      )}
      <AddLogModal
        isOpen={isLogOpen}
        onClose={() => setIsLogOpen(false)}
        contactId={contact.id}
      />
      <SendEmailModal
        isOpen={isEmailOpen}
        onClose={() => setIsEmailOpen(false)}
        contactId={contact.id}
        contactEmail={contact.email}
      />
      <CreateTaskModal
        isOpen={isTaskOpen}
        onClose={() => setIsTaskOpen(false)}
        entityType={TaskEntityType.CONTACT}
        entityId={contact.id}
      />
    </div>
    </DetailPageLayout>
  );
}

function ContactCustomerGroups({
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

function OwnerSelect({
  currentOwnerId,
  ownerName,
  canEdit,
  onSave,
  isSaving,
}: {
  currentOwnerId: string | null;
  ownerName: string | null;
  canEdit: boolean;
  onSave: (ownerId: string | null) => Promise<void>;
  isSaving: boolean;
}) {
  const { data: users } = useUsers();

  if (!canEdit) {
    return (
      <div>
        <dt className="text-sm font-medium text-gray-500">Eigenaar</dt>
        <dd className="mt-1 text-sm text-gray-900">{ownerName || '—'}</dd>
      </div>
    );
  }

  return (
    <div>
      <dt className="text-sm font-medium text-gray-500">Eigenaar</dt>
      <dd className="mt-1">
        <select
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50"
          value={currentOwnerId || ''}
          disabled={isSaving}
          onChange={(e) => onSave(e.target.value || null)}
        >
          <option value="">Geen eigenaar</option>
          {(users || [])
            .filter((u) => u.isActive)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName}
              </option>
            ))}
        </select>
      </dd>
    </div>
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

function CardMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative ml-2 flex-shrink-0" ref={menuRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onEdit();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Bewerken
          </button>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Verwijderen
          </button>
        </div>
      )}
    </div>
  );
}
