import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useClientMe, useCreateNewAssignment } from './hooks/use-requests';
import { Spinner, Card, Button, Input, Select, ErrorBox } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { contactName } from '@/lib/labels';

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function NewRequestPage() {
  const { data: me, isLoading } = useClientMe();
  const create = useCreateNewAssignment();

  const accessOptions = (me?.access ?? []).map((a) => ({ value: a.contact.id, label: contactName(a.contact) }));
  const singleContactId = accessOptions.length === 1 ? accessOptions[0].value : '';

  const [contactId, setContactId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const effectiveContactId = singleContactId || contactId;

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!effectiveContactId) next.contactId = 'Selecteer een opdrachtgever.';
    if (!subject.trim()) next.subject = 'Onderwerp is verplicht.';
    if (description.trim().length < 10) next.description = 'Omschrijving moet minimaal 10 tekens bevatten.';
    if (preferredDate && preferredDate <= new Date().toISOString().slice(0, 10)) {
      next.preferredDate = 'Voorkeursdatum moet in de toekomst liggen.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setServerError(null);
    try {
      await create.mutateAsync({
        contactId: effectiveContactId,
        subject: subject.trim(),
        description: description.trim(),
        preferredDate: preferredDate || undefined,
      });
      setSuccess(true);
    } catch (err) {
      setServerError(getErrorMessage(err, 'Verzoek kon niet ingediend worden'));
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-50">
          <svg className="h-6 w-6 text-success-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Opdracht aangevraagd</h1>
        {/* B-403 (WP-B9): eerlijke bevestiging — het verzoek wordt per e-mail aan de
            organisatie gemeld (er is nog geen wachtrij in het stafportaal, Epic 2). */}
        <p className="text-sm text-gray-600">
          Uw aanvraag is ontvangen en per e-mail aan de organisatie doorgegeven. Wij nemen
          contact met u op.
        </p>
        <div className="flex justify-center gap-3">
          <Link
            to="/requests"
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Naar verzoeken
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
          >
            Naar dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link to="/requests" className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Terug naar verzoeken
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nieuwe opdracht aanvragen</h1>
        <p className="mt-1 text-sm text-gray-600">Vraag een nieuwe inspectie of opdracht aan bij de organisatie.</p>
      </div>

      {accessOptions.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-gray-500">
            U heeft geen rechten om nieuwe opdrachten aan te vragen. Neem contact op met de organisatie.
          </p>
        </Card>
      ) : (
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            {accessOptions.length > 1 && (
              <Select
                label="Opdrachtgever"
                placeholder="Selecteer een opdrachtgever"
                options={accessOptions}
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                error={errors.contactId}
              />
            )}

            <Input
              label="Onderwerp"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              error={errors.subject}
              placeholder="Bijv. NEN 1010 keuring nieuwbouw"
            />

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Omschrijving</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Beschrijf de gewenste opdracht…"
                className="block w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
              {errors.description ? (
                <p className="mt-1 text-sm text-danger-600">{errors.description}</p>
              ) : (
                <p className="mt-1 text-sm text-gray-500">Minimaal 10 tekens</p>
              )}
            </div>

            <Input
              type="date"
              label="Voorkeursdatum (optioneel)"
              min={tomorrow()}
              value={preferredDate}
              onChange={(e) => setPreferredDate(e.target.value)}
              error={errors.preferredDate}
            />

            <ErrorBox>{serverError}</ErrorBox>

            <div className="flex justify-end gap-3">
              <Link
                to="/requests"
                className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                Annuleren
              </Link>
              <Button type="submit" isLoading={create.isPending}>
                Verzoek indienen
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
