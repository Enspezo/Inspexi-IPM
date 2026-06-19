import { Link } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { LocationTypeBadge } from '@/components/location-type-badge';
import { useLocationContactPersons } from '../hooks/use-contacts';
import type { Location } from '@/types';

/**
 * Content of a location marker's map popup. Mounted lazily by `EntityMap`
 * (only while the popup is open), so the `useLocationContactPersons` query
 * only fires when the user actually opens a marker — never one query per
 * location on map load.
 */

export type LocationWithContact = Location & {
  contact?: {
    id: string;
    type: string;
    companyName: string | null;
    firstName: string | null;
    lastName: string | null;
  };
};

function getContactName(contact?: LocationWithContact['contact']): string {
  if (!contact) return 'Relatie';
  if (contact.companyName) return contact.companyName;
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Relatie';
}

interface LocationPopupProps {
  location: LocationWithContact;
}

export function LocationPopup({ location }: LocationPopupProps) {
  // Safe to call here: this component only mounts while the popup is open.
  const { data: links = [], isLoading } = useLocationContactPersons(location.id);

  const contactName = getContactName(location.contact);

  return (
    <div style={{ minWidth: 220, maxWidth: 280, fontFamily: 'inherit' }}>
      {/* Name + type */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-900">{location.name}</span>
        <LocationTypeBadge locationType={location.locationType} />
      </div>

      {/* Address */}
      <p className="mt-1 text-xs text-gray-500">
        {location.street} {location.houseNumber}, {location.postalCode} {location.city}
      </p>

      {/* Links to detail + relatie */}
      <div className="mt-2 flex flex-col gap-1">
        <Link
          to={`/contacts/locations/${location.id}`}
          className="text-xs font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          Locatie openen →
        </Link>
        {location.contact && (
          <Link
            to={`/contacts/${location.contactId}`}
            className="text-xs text-primary-600 hover:text-primary-800 hover:underline"
          >
            Relatie: {contactName}
          </Link>
        )}
      </div>

      {/* Linked contact persons (lazy) */}
      <div className="mt-3 border-t border-gray-100 pt-2">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          Contactpersonen
        </p>
        {isLoading ? (
          <div className="flex justify-center py-2">
            <Spinner size="sm" />
          </div>
        ) : links.length === 0 ? (
          <p className="py-1 text-xs text-gray-400">Geen contactpersonen</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {links.map((link) => {
              const person = link.contactPerson;
              if (!person) return null;
              // The contact the person belongs to (may differ from the location's contact).
              const personContactId = person.contact?.id;
              const name = `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim() || 'Contactpersoon';
              const content = (
                <>
                  <span className="text-xs font-medium text-gray-800">{name}</span>
                  {(person.email || person.phone) && (
                    <span className="block text-[11px] text-gray-400">
                      {[person.email, person.phone].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </>
              );
              return (
                <li key={link.id}>
                  {personContactId ? (
                    <Link
                      to={`/contacts/${personContactId}`}
                      state={{ focusPersonId: link.contactPersonId }}
                      className="block rounded px-1 py-0.5 hover:bg-gray-50"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className="px-1 py-0.5">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
