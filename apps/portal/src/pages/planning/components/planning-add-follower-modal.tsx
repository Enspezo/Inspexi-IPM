import { useState, useEffect, useRef } from 'react';
import type { ContactPerson } from '@/types';
import { Button, Input, Modal, useToast } from '@/components/ui';
import { useAddFollower } from '../hooks/use-planning-followers';
import { getErrorMessage } from '@/lib/api-client';

export function PlanningAddFollowerModal({
  id,
  contactId,
  contactName,
  addFollowerOpen,
  setAddFollowerOpen,
  followerSearch,
  setFollowerSearch,
  contactPersons,
  existingFollowerEmails,
}: {
  id: string;
  contactId: string | null | undefined;
  contactName: string;
  addFollowerOpen: boolean;
  setAddFollowerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  followerSearch: string;
  setFollowerSearch: React.Dispatch<React.SetStateAction<string>>;
  contactPersons: ContactPerson[];
  existingFollowerEmails: Set<string>;
}) {
  const { showToast } = useToast();
  const [showFollowerDropdown, setShowFollowerDropdown] = useState(false);
  const [newFollowerEmail, setNewFollowerEmail] = useState('');
  const [newFollowerName, setNewFollowerName] = useState('');
  const followerSearchRef = useRef<HTMLDivElement>(null);

  const addFollower = useAddFollower(id);

  // Sluit volger-dropdown bij klik buiten
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (followerSearchRef.current && !followerSearchRef.current.contains(e.target as Node)) {
        setShowFollowerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleAddFollowerFromContactPerson = async (person: ContactPerson) => {
    if (!person.email) {
      showToast('Contactpersoon heeft geen e-mailadres', 'error');
      return;
    }
    try {
      await addFollower.mutateAsync({
        email: person.email,
        name: `${person.firstName} ${person.lastName}`.trim(),
      });
      setAddFollowerOpen(false);
      setFollowerSearch('');
      setShowFollowerDropdown(false);
      showToast('Volger toegevoegd', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Fout bij toevoegen volger'), 'error');
    }
  };

  const handleAddFollower = async () => {
    if (!newFollowerEmail.trim()) return;
    try {
      await addFollower.mutateAsync({ email: newFollowerEmail, name: newFollowerName || undefined });
      setAddFollowerOpen(false);
      setNewFollowerEmail('');
      setNewFollowerName('');
      setFollowerSearch('');
      showToast('Volger toegevoegd', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Fout bij toevoegen volger'), 'error');
    }
  };

  return (
    <Modal
      isOpen={addFollowerOpen}
      onClose={() => {
        setAddFollowerOpen(false);
        setFollowerSearch('');
        setShowFollowerDropdown(false);
        setNewFollowerEmail('');
        setNewFollowerName('');
      }}
      title="Volger toevoegen"
    >
      <div className="space-y-5">
        {/* Sectie 1: contactpersonen opdrachtgever */}
        {contactId && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contactpersonen van {contactName}
            </label>
            <div ref={followerSearchRef} className="relative">
              <Input
                placeholder="Zoek op naam of e-mail..."
                value={followerSearch}
                onChange={(e) => {
                  setFollowerSearch(e.target.value);
                  setShowFollowerDropdown(true);
                }}
                onFocus={() => setShowFollowerDropdown(true)}
              />
              {showFollowerDropdown && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-52 overflow-y-auto">
                  {contactPersons.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500">
                      {followerSearch ? 'Geen resultaten' : 'Geen contactpersonen gevonden'}
                    </div>
                  ) : (
                    contactPersons.map((person) => {
                      const alreadyFollower = person.email ? existingFollowerEmails.has(person.email) : false;
                      return (
                        <button
                          key={person.id}
                          type="button"
                          disabled={alreadyFollower || !person.email}
                          onClick={() => handleAddFollowerFromContactPerson(person)}
                          className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                            alreadyFollower || !person.email
                              ? 'cursor-not-allowed opacity-50'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="font-medium text-gray-900">
                            {person.firstName} {person.lastName}
                            {alreadyFollower && (
                              <span className="ml-2 text-xs text-gray-400">(al toegevoegd)</span>
                            )}
                          </div>
                          {person.email ? (
                            <div className="text-xs text-gray-500">{person.email}</div>
                          ) : (
                            <div className="text-xs text-amber-600">Geen e-mailadres</div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Scheidingslijn */}
        {contactId && (
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-400">Of voeg handmatig toe</span>
            </div>
          </div>
        )}

        {/* Sectie 2: handmatig naam + email */}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-mailadres</label>
            <Input
              type="email"
              value={newFollowerEmail}
              onChange={(e) => setNewFollowerEmail(e.target.value)}
              placeholder="naam@bedrijf.nl"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Naam (optioneel)</label>
            <Input
              value={newFollowerName}
              onChange={(e) => setNewFollowerName(e.target.value)}
              placeholder="Naam volger"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => {
              setAddFollowerOpen(false);
              setFollowerSearch('');
              setShowFollowerDropdown(false);
              setNewFollowerEmail('');
              setNewFollowerName('');
            }}>Annuleren</Button>
            <Button
              onClick={handleAddFollower}
              disabled={!newFollowerEmail.trim() || addFollower.isPending}
            >
              Toevoegen
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
