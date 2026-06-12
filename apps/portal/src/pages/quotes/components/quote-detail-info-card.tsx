import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Quote } from '@/types';
import { Button, Card, InfoField, Input } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { useUpdateQuote } from '../hooks/use-quotes';
import { getContactName } from './quote-detail-helpers';
import { getErrorMessage } from '@/lib/api-client';

const quoteSchema = z.object({
  subject: z.string().min(1, 'Onderwerp is verplicht'),
  validUntil: z.string().optional(),
  internalNotes: z.string().optional(),
});

type QuoteFormData = z.infer<typeof quoteSchema>;

export function QuoteInfoCard({
  quote,
  canEditQuote,
  updateQuoteMutation,
  showToast,
}: {
  quote: Quote;
  canEditQuote: boolean;
  updateQuoteMutation: ReturnType<typeof useUpdateQuote>;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const [isEditing, setIsEditing] = useState(false);

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors: formErrors, isDirty },
  } = useForm<QuoteFormData>({ resolver: zodResolver(quoteSchema) });

  useEffect(() => {
    if (quote) {
      resetForm({
        subject: quote.subject || '',
        validUntil: quote.validUntil ? quote.validUntil.split('T')[0] : '',
        internalNotes: quote.internalNotes || '',
      });
    }
  }, [quote, resetForm]);

  const onSubmitQuote = async (data: QuoteFormData) => {
    try {
      await updateQuoteMutation.mutateAsync({
        subject: data.subject,
        validUntil: data.validUntil || undefined,
        internalNotes: data.internalNotes || undefined,
      });
      showToast('Offerte bijgewerkt', 'success');
      setIsEditing(false);
    } catch (err) {
      showToast(getErrorMessage(err, 'Bijwerken mislukt'), 'error');
    }
  };

  const handleCancelEdit = () => {
    if (quote) {
      resetForm({
        subject: quote.subject || '',
        validUntil: quote.validUntil ? quote.validUntil.split('T')[0] : '',
        internalNotes: quote.internalNotes || '',
      });
    }
    setIsEditing(false);
  };

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Offertegegevens</h3>
        {canEditQuote && !isEditing && (
          <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
            Bewerken
          </Button>
        )}
      </div>
      {isEditing ? (
        <form onSubmit={handleSubmit(onSubmitQuote)} className="space-y-4">
          <Input
            label="Onderwerp"
            error={formErrors.subject?.message}
            {...register('subject')}
          />
          <Input
            label="Geldig tot"
            type="date"
            error={formErrors.validUntil?.message}
            {...register('validUntil')}
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Interne notities
            </label>
            <textarea
              {...register('internalNotes')}
              rows={3}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              placeholder="Interne notities (niet zichtbaar voor klant)..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={handleCancelEdit}>
              Annuleren
            </Button>
            <Button type="submit" disabled={!isDirty} isLoading={updateQuoteMutation.isPending}>
              Opslaan
            </Button>
          </div>
        </form>
      ) : (
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-3">
        <InfoField label="Onderwerp" value={quote.subject} />
        <div>
          <dt className="text-sm font-medium text-gray-500">Relatie</dt>
          <dd className="mt-1 text-sm text-gray-900">
            {quote.contact ? (
              <Link to={`/contacts/${quote.contactId}`} className="text-primary-600 hover:text-primary-800 hover:underline">
                {getContactName(quote.contact)}
              </Link>
            ) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-gray-500">Locatie</dt>
          <dd className="mt-1 text-sm text-gray-900">{quote.location ? `${quote.location.name} — ${quote.location.city}` : '—'}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-gray-500">Aanvraag</dt>
          <dd className="mt-1 text-sm text-gray-900">
            {quote.request ? (
              <Link to={`/requests/${quote.requestId}`} className="text-primary-600 hover:text-primary-800 hover:underline">{quote.request.title}</Link>
            ) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-gray-500">Template</dt>
          <dd className="mt-1 text-sm text-gray-900">{quote.template ? quote.template.name : '—'}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-gray-500">Geldig tot</dt>
          <dd className="mt-1 text-sm text-gray-900">
            {quote.validUntil ? new Date(quote.validUntil).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-gray-500">Aangemaakt door</dt>
          <dd className="mt-1 text-sm text-gray-900">
            {quote.createdByUser ? `${quote.createdByUser.firstName} ${quote.createdByUser.lastName}` : '—'}
          </dd>
        </div>
        {quote.sentAt && (
          <div>
            <dt className="text-sm font-medium text-gray-500">Verstuurd op</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatDate(quote.sentAt)}</dd>
          </div>
        )}
        {quote.viewedAt && (
          <div>
            <dt className="text-sm font-medium text-gray-500">Geopend op</dt>
            <dd className="mt-1 text-sm text-gray-900">{formatDate(quote.viewedAt)}</dd>
          </div>
        )}
        {quote.publicToken && (
          <div>
            <dt className="text-sm font-medium text-gray-500">Publieke link</dt>
            <dd className="mt-1 text-sm">
              <a
                href={`/offerte/${quote.publicToken}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-800 hover:underline text-xs"
              >
                Klantportaal bekijken →
              </a>
            </dd>
          </div>
        )}
      </div>
      )}
    </Card>
  );
}
