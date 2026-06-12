import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Card, Input, Select, Spinner, useToast, RichTextEditor } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import { useContactLocations } from '@/pages/contacts/hooks/use-contacts';
import { ContactSearchInput } from '@/components/contacts/contact-search-input';
import { useProducts } from '@/pages/products/hooks/use-products';
import { useQuoteTemplates } from './hooks/use-quote-templates';
import {
  useQuote,
  useCreateQuote,
  useUpdateQuote,
  useSetQuoteLines,
  useResolvePrice,
} from './hooks/use-quotes';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { formatCurrency } from '@/lib/format';
import type { ResolvedPrice } from '@/types';

const schema = z.object({
  subject: z.string().min(1, 'Onderwerp is verplicht'),
  contactId: z.string().min(1, 'Relatie is verplicht'),
  locationId: z.string().optional(),
  templateId: z.string().optional(),
  validUntil: z.string().optional(),
  internalNotes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface EditorLine {
  key: string;
  productId: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  discountPct: number;
}


function calcLineTotal(line: EditorLine): number {
  return line.quantity * line.unitPrice * (1 - line.discountPct / 100);
}

let lineKeyCounter = 0;
function nextLineKey(): string {
  lineKeyCounter += 1;
  return `line-${lineKeyCounter}`;
}

export default function QuoteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const isEditing = !!id;

  const { data: existingQuote, isLoading: quoteLoading } = useQuote(id || '');
  const createMutation = useCreateQuote();
  const updateMutation = useUpdateQuote(id || '');

  const { data: productsData } = useProducts({ isActive: true, limit: 100 });
  const { data: templatesData } = useQuoteTemplates({ isActive: true, limit: 100 });

  const [selectedContactId, setSelectedContactId] = useState('');
  const { data: locationsData } = useContactLocations(selectedContactId);

  const [lines, setLines] = useState<EditorLine[]>([]);
  const [pendingProductId, setPendingProductId] = useState('');
  const [contentBlocks, setContentBlocks] = useState<object | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      subject: '',
      contactId: '',
      locationId: '',
      templateId: '',
      validUntil: '',
      internalNotes: '',
    },
  });

  const handleContactSelect = (contactId: string) => {
    if (contactId !== selectedContactId) {
      setValue('contactId', contactId, { shouldValidate: true });
      setSelectedContactId(contactId || '');
      setValue('locationId', '');
    }
  };

  // Load existing quote data when editing
  useEffect(() => {
    if (isEditing && existingQuote) {
      reset({
        subject: existingQuote.subject,
        contactId: existingQuote.contactId,
        locationId: existingQuote.locationId || '',
        templateId: existingQuote.templateId || '',
        validUntil: existingQuote.validUntil
          ? existingQuote.validUntil.substring(0, 10)
          : '',
        internalNotes: existingQuote.internalNotes || '',
      });
      setSelectedContactId(existingQuote.contactId);
      if (existingQuote.contentBlocks) setContentBlocks(existingQuote.contentBlocks as object);
      if (existingQuote.lines) {
        setLines(
          existingQuote.lines.map((l) => ({
            key: nextLineKey(),
            productId: l.productId,
            description: l.description,
            quantity: l.quantity,
            unit: l.unit,
            unitPrice: l.unitPrice,
            vatRate: l.vatRate,
            discountPct: l.discountPct,
          })),
        );
      }
    }
  }, [isEditing, existingQuote, reset]);

  // Pre-fill contactId from URL query param (e.g. /quotes/new?contactId=xxx)
  useEffect(() => {
    if (!isEditing) {
      const prefilledContactId = searchParams.get('contactId');
      if (prefilledContactId) {
        setValue('contactId', prefilledContactId);
        setSelectedContactId(prefilledContactId);
      }
    }
  }, [isEditing, searchParams, setValue]);

  const products = productsData?.data || [];
  const templates = templatesData?.data || [];
  const locations = locationsData || [];

  const locationOptions = [
    { value: '', label: 'Geen locatie' },
    ...locations.map((l) => ({
      value: l.id,
      label: `${l.name} \u2014 ${l.city}`,
    })),
  ];

  const templateOptions = [
    { value: '', label: 'Geen template' },
    ...templates.map((t) => ({
      value: t.id,
      label: t.name,
    })),
  ];

  const productOptions = [
    { value: '', label: 'Selecteer product...' },
    ...products.map((p) => ({
      value: p.id,
      label: `${p.name}${p.productGroup ? ` (${p.productGroup.name})` : ''}`,
    })),
  ];

  const handleAddProduct = useCallback(async () => {
    if (!pendingProductId || !selectedContactId) {
      if (!selectedContactId) {
        showToast('Selecteer eerst een relatie', 'error');
      }
      return;
    }

    try {
      const qs = new URLSearchParams();
      qs.set('productId', pendingProductId);
      qs.set('contactId', selectedContactId);
      const resolved = await apiClient.get<ResolvedPrice>(`/quotes/resolve-price?${qs.toString()}`);

      const product = products.find((p) => p.id === pendingProductId);
      setLines((prev) => [
        ...prev,
        {
          key: nextLineKey(),
          productId: pendingProductId,
          description: product?.name || '',
          quantity: 1,
          unit: resolved.unit || product?.unit || 'stuk',
          unitPrice: resolved.unitPrice,
          vatRate: resolved.vatRate,
          discountPct: 0,
        },
      ]);
      setPendingProductId('');
    } catch {
      // Fallback if resolve-price fails — use product defaults
      const product = products.find((p) => p.id === pendingProductId);
      if (product) {
        setLines((prev) => [
          ...prev,
          {
            key: nextLineKey(),
            productId: pendingProductId,
            description: product.name,
            quantity: 1,
            unit: product.unit,
            unitPrice: 0,
            vatRate: product.defaultVat,
            discountPct: 0,
          },
        ]);
      }
      setPendingProductId('');
      showToast('Prijs kon niet worden opgehaald, vul handmatig in', 'error');
    }
  }, [pendingProductId, selectedContactId, products, showToast]);

  const handleAddFreeLine = () => {
    setLines((prev) => [
      ...prev,
      {
        key: nextLineKey(),
        productId: null,
        description: '',
        quantity: 1,
        unit: 'stuk',
        unitPrice: 0,
        vatRate: 21,
        discountPct: 0,
      },
    ]);
  };

  const handleRemoveLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const handleLineChange = (key: string, field: keyof EditorLine, value: string | number) => {
    setLines((prev) =>
      prev.map((l) =>
        l.key === key ? { ...l, [field]: value } : l,
      ),
    );
  };

  // Calculate totals
  const subtotal = lines.reduce((sum, l) => sum + calcLineTotal(l), 0);
  const vatTotal = lines.reduce(
    (sum, l) => sum + calcLineTotal(l) * (l.vatRate / 100),
    0,
  );
  const total = subtotal + vatTotal;

  const [linesQuoteId, setLinesQuoteId] = useState<string | null>(null);
  const setLinesMutation = useSetQuoteLines(linesQuoteId || id || '');

  const onSubmit = async (data: FormData) => {
    try {
      let quoteId: string;

      const payload = {
        subject: data.subject,
        contactId: data.contactId,
        locationId: data.locationId || undefined,
        templateId: data.templateId || undefined,
        validUntil: data.validUntil || undefined,
        internalNotes: data.internalNotes || undefined,
        contentBlocks: contentBlocks ?? undefined,
      };

      if (isEditing) {
        await updateMutation.mutateAsync(payload);
        quoteId = id!;
      } else {
        const created = await createMutation.mutateAsync(payload);
        quoteId = created.id;
        setLinesQuoteId(quoteId);
      }

      // Save lines
      if (lines.length > 0) {
        const linePayload = {
          lines: lines.map((l, idx) => ({
            productId: l.productId || undefined,
            description: l.description,
            quantity: l.quantity,
            unit: l.unit,
            unitPrice: l.unitPrice,
            vatRate: l.vatRate,
            discountPct: l.discountPct,
            sortOrder: idx,
          })),
        };

        // For newly created quotes, we need to call the API directly
        // since the mutation hook may not have the correct ID yet
        if (!isEditing) {
          await apiClient.put(`/quotes/${quoteId}/lines`, linePayload);
        } else {
          await setLinesMutation.mutateAsync(linePayload);
        }
      }

      showToast(isEditing ? 'Offerte bijgewerkt' : 'Offerte aangemaakt', 'success');
      navigate(`/quotes/${quoteId}`);
    } catch (err) {
      showToast(getErrorMessage(err, isEditing ? 'Bijwerken mislukt' : 'Aanmaken mislukt'), 'error');
    }
  };

  if (isEditing && quoteLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(isEditing ? `/quotes/${id}` : '/quotes')}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-2xl font-bold text-gray-900">
            {isEditing ? 'Offerte bewerken' : 'Nieuwe offerte'}
          </h2>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic info */}
        <Card>
          <div className="space-y-4">
            <Input
              label="Onderwerp"
              placeholder="Omschrijving van de offerte"
              error={errors.subject?.message}
              {...register('subject')}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ContactSearchInput
                label="Relatie"
                value={selectedContactId}
                onSelect={handleContactSelect}
                error={errors.contactId?.message}
              />

              {selectedContactId && locations.length > 0 && (
                <Select
                  label="Locatie"
                  options={locationOptions}
                  {...register('locationId')}
                />
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Select
                label="Template"
                options={templateOptions}
                {...register('templateId')}
              />

              <Input
                label="Geldig tot"
                type="date"
                {...register('validUntil')}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Interne notities
              </label>
              <textarea
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm transition-colors duration-150 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-0"
                rows={3}
                placeholder="Optionele interne notities..."
                {...register('internalNotes')}
              />
            </div>
          </div>
        </Card>

        {/* Content blocks */}
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Inhoud</h3>
          <p className="text-sm text-gray-500 mb-4">Optionele tekst die zichtbaar is voor de klant in het klantportaal.</p>
          <RichTextEditor
            value={contentBlocks}
            onChange={setContentBlocks}
            placeholder="Schrijf hier een omschrijving, voorwaarden of andere informatie voor de klant..."
          />
        </Card>

        {/* Lines */}
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Offerteregels</h3>

          {/* Add product controls */}
          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <Select
                options={productOptions}
                value={pendingProductId}
                onChange={(e) => setPendingProductId(e.target.value)}
              />
            </div>
            <Button type="button" variant="secondary" onClick={handleAddProduct} disabled={!pendingProductId}>
              Product toevoegen
            </Button>
            <Button type="button" variant="secondary" onClick={handleAddFreeLine}>
              Vrije regel toevoegen
            </Button>
          </div>

          {/* Lines table */}
          {lines.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Nog geen regels toegevoegd. Voeg een product of vrije regel toe.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Omschrijving
                    </th>
                    <th className="w-20 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Aantal
                    </th>
                    <th className="w-24 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Eenheid
                    </th>
                    <th className="w-28 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Eenheidsprijs
                    </th>
                    <th className="w-20 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Korting%
                    </th>
                    <th className="w-20 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      BTW%
                    </th>
                    <th className="w-28 px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                      Regeltotaal
                    </th>
                    <th className="w-12 px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lines.map((line) => (
                    <tr key={line.key}>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20"
                          value={line.description}
                          onChange={(e) =>
                            handleLineChange(line.key, 'description', e.target.value)
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20"
                          value={line.quantity}
                          onChange={(e) =>
                            handleLineChange(line.key, 'quantity', parseFloat(e.target.value) || 0)
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20"
                          value={line.unit}
                          onChange={(e) =>
                            handleLineChange(line.key, 'unit', e.target.value)
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20"
                          value={line.unitPrice}
                          onChange={(e) =>
                            handleLineChange(line.key, 'unitPrice', parseFloat(e.target.value) || 0)
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20"
                          value={line.discountPct}
                          onChange={(e) =>
                            handleLineChange(line.key, 'discountPct', parseFloat(e.target.value) || 0)
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20"
                          value={line.vatRate}
                          onChange={(e) =>
                            handleLineChange(line.key, 'vatRate', parseFloat(e.target.value) || 0)
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="text-sm font-medium text-gray-900">
                          {formatCurrency(calcLineTotal(line))}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(line.key)}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals */}
          {lines.length > 0 && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <div className="flex flex-col items-end space-y-1">
                <div className="flex w-64 justify-between text-sm">
                  <span className="text-gray-500">Subtotaal</span>
                  <span className="text-gray-900">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex w-64 justify-between text-sm">
                  <span className="text-gray-500">BTW</span>
                  <span className="text-gray-900">{formatCurrency(vatTotal)}</span>
                </div>
                <div className="flex w-64 justify-between border-t border-gray-200 pt-1">
                  <span className="text-sm font-semibold text-gray-900">Totaal</span>
                  <span className="text-lg font-bold text-gray-900">{formatCurrency(total)}</span>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(isEditing ? `/quotes/${id}` : '/quotes')}
          >
            Annuleren
          </Button>
          <Button
            type="submit"
            isLoading={createMutation.isPending || updateMutation.isPending}
          >
            {isEditing ? 'Opslaan' : 'Offerte aanmaken'}
          </Button>
        </div>
      </form>
    </div>
  );
}
