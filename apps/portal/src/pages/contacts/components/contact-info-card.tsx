import { ContactType } from '@/types';
import type { Contact } from '@/types';
import { Card, InfoField } from '@/components/ui';

export function ContactInfoCard({
  contact,
  userCanWrite,
  onEmailOpen,
  onLogCall,
}: {
  contact: Contact;
  userCanWrite: boolean;
  onEmailOpen: () => void;
  onLogCall: () => void;
}) {
  return (
    <Card>
      <div className="grid grid-cols-2 gap-6">
        {contact.type === ContactType.COMPANY && (
          <>
            <InfoField label="Bedrijfsnaam" value={contact.companyName} />
            <InfoField label="KvK-nummer" value={contact.cocNumber} />
            <InfoField label="BTW-nummer" value={contact.vatNumber} />
            <InfoField label="Website" value={contact.website} />
            <InfoField label="Leverancier" value={contact.isSupplier ? 'Ja' : 'Nee'} />
          </>
        )}
        {contact.type === ContactType.INDIVIDUAL && (
          <>
            <InfoField label="Voornaam" value={contact.firstName} />
            <InfoField label="Achternaam" value={contact.lastName} />
          </>
        )}
        <div>
          <dt className="text-sm font-medium text-gray-500">E-mail</dt>
          <dd className="mt-1 flex items-center gap-1.5 text-sm text-gray-900">
            {contact.email || '—'}
            {contact.email && userCanWrite && (
              <button
                type="button"
                onClick={onEmailOpen}
                title="E-mail versturen"
                className="rounded p-0.5 text-gray-400 transition-colors hover:bg-primary-50 hover:text-primary-600"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </button>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-gray-500">Telefoon</dt>
          <dd className="mt-1 flex items-center gap-1.5 text-sm text-gray-900">
            {contact.phone || '—'}
            {contact.phone && (
              <a
                href={`tel:${contact.phone}`}
                title="Bellen & contactmoment loggen"
                className="rounded p-0.5 text-gray-400 transition-colors hover:bg-primary-50 hover:text-primary-600"
                onClick={onLogCall}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </a>
            )}
          </dd>
        </div>
        <InfoField
          label="Eigenaar"
          value={contact.owner ? `${contact.owner.firstName} ${contact.owner.lastName}` : null}
        />
        <div className="col-span-2">
          <InfoField label="Notities" value={contact.notes} />
        </div>
      </div>
    </Card>
  );
}
