import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ContactType, LogType, Role } from '@/types';
import type { Contact, ContactLog, ContactEmail } from '@/types';
import { Button, Card, Spinner, useToast } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import { useContact, useDeleteContact } from './hooks/use-contacts';
import { AddAddressModal } from './components/add-address-modal';
import { AddLocationModal } from './components/add-location-modal';
import { AddLogModal } from './components/add-log-modal';
import { SendEmailModal } from './components/send-email-modal';

type Tab = 'algemeen' | 'adressen' | 'locaties' | 'geschiedenis';

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

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data: contact, isLoading, error } = useContact(id!);
  const deleteMutation = useDeleteContact();

  const [activeTab, setActiveTab] = useState<Tab>('algemeen');
  const [isAddressOpen, setIsAddressOpen] = useState(false);
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isEmailOpen, setIsEmailOpen] = useState(false);

  const userCanWrite = user && canWrite.includes(user.role);

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
          <Button variant="danger" size="sm" onClick={handleDelete}>
            Verwijderen
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
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
            <div className="col-span-2">
              <InfoField label="Notities" value={contact.notes} />
            </div>
          </div>
        </Card>
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
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">
                        {addr.label}
                      </span>
                      {addr.isPrimary && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                          Primair
                        </span>
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
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">
                        {loc.name}
                      </span>
                      {loc.objectType && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                          {loc.objectType}
                        </span>
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

      {/* Modals */}
      <AddAddressModal
        isOpen={isAddressOpen}
        onClose={() => setIsAddressOpen(false)}
        contactId={contact.id}
      />
      <AddLocationModal
        isOpen={isLocationOpen}
        onClose={() => setIsLocationOpen(false)}
        contactId={contact.id}
      />
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
