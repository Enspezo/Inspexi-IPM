import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Input, useToast } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { useContactPersons, useContacts, useContactLocations, useAddContactPerson } from '@/pages/contacts/hooks/use-contacts';
import { useCreatePlanningItem } from '../hooks/use-planning';
import { getErrorMessage } from '@/lib/api-client';

export function CreatePlanningForm() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const createItem = useCreatePlanningItem();
  const { data: contactsData } = useContacts({ limit: 100 });
  const contacts = contactsData?.data ?? [];

  const [contactId, setContactId] = useState('');
  const [contactPersonId, setContactPersonId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [productName, setProductName] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [sessionCount, setSessionCount] = useState('');

  // Inline contactpersoon aanmaken
  const [showCreatePerson, setShowCreatePerson] = useState(false);
  const [newPersonFirstName, setNewPersonFirstName] = useState('');
  const [newPersonLastName, setNewPersonLastName] = useState('');
  const [newPersonEmail, setNewPersonEmail] = useState('');
  const [newPersonPhone, setNewPersonPhone] = useState('');

  const { data: locationsData } = useContactLocations(contactId);
  const locations = locationsData ?? [];

  const { data: contactPersonsData } = useContactPersons({ contactId: contactId || undefined, limit: 100 });
  const contactPersons = contactPersonsData?.data ?? [];
  const addContactPersonMutation = useAddContactPerson(contactId);

  const suggestedSessionCount = durationHours
    ? Math.ceil(Number(durationHours) / 8)
    : 0;

  const handleContactChange = (value: string) => {
    setContactId(value);
    setLocationId('');
    setContactPersonId('');
    setShowCreatePerson(false);
  };

  const handleCreatePerson = async () => {
    if (!newPersonFirstName.trim() || !newPersonLastName.trim()) {
      showToast('Voornaam en achternaam zijn verplicht', 'error');
      return;
    }
    try {
      const created = await addContactPersonMutation.mutateAsync({
        firstName: newPersonFirstName.trim(),
        lastName: newPersonLastName.trim(),
        email: newPersonEmail.trim() || undefined,
        phone: newPersonPhone.trim() || undefined,
        // roleId weggelaten → backend valt terug op standaardrol "Algemeen"
      });
      setContactPersonId((created as any).id);
      setShowCreatePerson(false);
      setNewPersonFirstName('');
      setNewPersonLastName('');
      setNewPersonEmail('');
      setNewPersonPhone('');
      showToast('Contactpersoon aangemaakt', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Fout bij aanmaken contactpersoon'), 'error');
    }
  };

  const handleSubmit = async () => {
    if (!contactId || !productName.trim()) {
      showToast('Opdrachtgever en dienstnaam zijn verplicht', 'error');
      return;
    }
    if (isMultiDay) {
      const sc = Number(sessionCount);
      if (!sc || sc < 2 || sc > 30) {
        showToast('Aantal sessies moet tussen 2 en 30 liggen', 'error');
        return;
      }
    }
    try {
      const newItem = await createItem.mutateAsync({
        contactId,
        contactPersonId: contactPersonId || undefined,
        locationId: locationId || undefined,
        productName: productName.trim(),
        scheduledDate: scheduledDate ? new Date(scheduledDate).toISOString() : undefined,
        durationHours: durationHours ? Number(durationHours) : undefined,
        internalNotes: internalNotes.trim() || undefined,
        isMultiDay,
        sessionCount: isMultiDay ? Number(sessionCount) : undefined,
      });
      showToast('Planregel aangemaakt', 'success');
      navigate(`/planning/${(newItem as any).id}`);
    } catch (err) {
      showToast(getErrorMessage(err, 'Fout bij aanmaken planregel'), 'error');
    }
  };

  return (
    <DetailPageLayout>
      <div className="mb-6">
        <button
          onClick={() => navigate('/planning')}
          className="text-sm text-gray-500 hover:text-gray-700 mb-3 flex items-center gap-1"
        >
          ← Terug naar planning
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Nieuwe planregel</h1>
      </div>

      <Card>
        <div className="p-6 space-y-5">
          {/* Contact */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Opdrachtgever <span className="text-red-500">*</span>
            </label>
            <select
              value={contactId}
              onChange={(e) => handleContactChange(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Selecteer opdrachtgever —</option>
              {contacts.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.companyName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()}
                </option>
              ))}
            </select>
          </div>

          {/* Contactpersoon */}
          {contactId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contactpersoon (optioneel)</label>
              {contactPersons.length > 0 ? (
                <select
                  value={contactPersonId}
                  onChange={(e) => setContactPersonId(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Geen contactpersoon —</option>
                  {contactPersons.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName}{p.email ? ` — ${p.email}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-gray-500 mb-2">Geen contactpersonen gevonden voor deze opdrachtgever.</p>
              )}
              {!showCreatePerson && (
                <button
                  type="button"
                  onClick={() => setShowCreatePerson(true)}
                  className="mt-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  + Nieuwe contactpersoon aanmaken
                </button>
              )}
              {showCreatePerson && (
                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
                  <p className="text-sm font-medium text-gray-700">Nieuwe contactpersoon</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Voornaam <span className="text-red-500">*</span></label>
                      <Input
                        value={newPersonFirstName}
                        onChange={(e) => setNewPersonFirstName(e.target.value)}
                        placeholder="Voornaam"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Achternaam <span className="text-red-500">*</span></label>
                      <Input
                        value={newPersonLastName}
                        onChange={(e) => setNewPersonLastName(e.target.value)}
                        placeholder="Achternaam"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
                      <Input
                        type="email"
                        value={newPersonEmail}
                        onChange={(e) => setNewPersonEmail(e.target.value)}
                        placeholder="jan@voorbeeld.nl"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Telefoon</label>
                      <Input
                        value={newPersonPhone}
                        onChange={(e) => setNewPersonPhone(e.target.value)}
                        placeholder="+31 6 12345678"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleCreatePerson}
                      disabled={addContactPersonMutation.isPending}
                    >
                      {addContactPersonMutation.isPending ? 'Aanmaken...' : 'Aanmaken'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setShowCreatePerson(false); setNewPersonFirstName(''); setNewPersonLastName(''); setNewPersonEmail(''); setNewPersonPhone(''); }}
                    >
                      Annuleren
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Location */}
          {contactId && locations.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Locatie (optioneel)</label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Selecteer locatie —</option>
                {locations.map((l: any) => (
                  <option key={l.id} value={l.id}>
                    {l.name || [l.street, l.houseNumber, l.city].filter(Boolean).join(' ')}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Product name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dienst / product <span className="text-red-500">*</span>
            </label>
            <Input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="bijv. NEN1010 Inspectie"
            />
          </div>

          {/* Date/Duration row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Datum & tijd (optioneel)</label>
              <input
                type="datetime-local"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Totale duur (uur, optioneel)</label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={durationHours}
                onChange={(e) => setDurationHours(e.target.value)}
                placeholder="bijv. 40"
              />
            </div>
          </div>

          {/* Multi-day toggle */}
          <div className="flex items-start gap-3 rounded-lg border border-gray-200 p-4">
            <input
              id="multiday"
              type="checkbox"
              checked={isMultiDay}
              onChange={(e) => {
                setIsMultiDay(e.target.checked);
                if (e.target.checked && suggestedSessionCount >= 2) {
                  setSessionCount(String(suggestedSessionCount));
                }
              }}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            <div className="flex-1">
              <label htmlFor="multiday" className="text-sm font-medium text-gray-900 cursor-pointer">
                Meerdaagse planning
              </label>
              <p className="text-xs text-gray-500 mt-0.5">
                Splits de opdracht op in meerdere sessies op afzonderlijke dagen.
              </p>
              {isMultiDay && (
                <div className="mt-3 space-y-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Aantal sessies <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="number"
                      min="2"
                      max="30"
                      value={sessionCount}
                      onChange={(e) => setSessionCount(e.target.value)}
                      placeholder="Aantal sessies (2–30)"
                    />
                    {durationHours && suggestedSessionCount >= 2 && (
                      <p className="text-xs text-blue-600 mt-1">
                        Op basis van {durationHours} uur adviseren wij {suggestedSessionCount} sessies van ±8 uur.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Internal notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Interne notities (optioneel)</label>
            <textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optionele interne notities..."
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSubmit} disabled={createItem.isPending}>
              {createItem.isPending ? 'Aanmaken...' : 'Planregel aanmaken'}
            </Button>
            <Button variant="secondary" onClick={() => navigate('/planning')}>
              Annuleren
            </Button>
          </div>
        </div>
      </Card>
    </DetailPageLayout>
  );
}
