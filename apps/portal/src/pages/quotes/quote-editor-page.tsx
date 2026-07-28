import { useState, useEffect, useCallback, useRef } from 'react';
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
import { useWindowTabSync } from '@/providers/window-tabs';
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
  /** B-309: prijs handmatig aangepast → staffel-herberekening blijft er vanaf. */
  priceOverridden: boolean;
  /** Herkomst van de prijs ("staffel 10–49: € 10,00"), alleen bij prijstabel-match. */
  priceSource: string | null;
}


function calcLineTotal(line: EditorLine): number {
  return line.quantity * line.unitPrice * (1 - line.discountPct / 100);
}

let lineKeyCounter = 0;
function nextLineKey(): string {
  lineKeyCounter += 1;
  return `line-${lineKeyCounter}`;
}

/** Leesbaar herkomst-label voor een resolve-price-resultaat (B-309). */
function priceSourceLabel(resolved: ResolvedPrice): string | null {
  if (resolved.priceType === 'TIERED' && resolved.tier) {
    const range =
      resolved.tier.toQty != null
        ? `${resolved.tier.fromQty}–${resolved.tier.toQty}`
        : `${resolved.tier.fromQty}+`;
    return `staffel ${range}: ${formatCurrency(resolved.unitPrice)}`;
  }
  if (resolved.priceType === 'FIXED') return `vaste prijs: ${formatCurrency(resolved.unitPrice)}`;
  return null;
}

// Zelfde grenzen als de backend-DTO (B-302/B-303) — meldingen in het Nederlands.
const MAX_LINE_VALUE = 9_999_999.99;

type LineField = 'description' | 'quantity' | 'unitPrice' | 'discountPct' | 'vatRate';
type LineFieldErrors = Partial<Record<LineField, string>>;

/** NL-veldvalidatie per offerteregel; vervangt de native (Engelse) browserbubbels. */
function validateLines(lines: EditorLine[]): Record<string, LineFieldErrors> {
  const errors: Record<string, LineFieldErrors> = {};
  for (const line of lines) {
    const e: LineFieldErrors = {};
    if (line.quantity < 0) e.quantity = 'Aantal mag niet negatief zijn';
    else if (line.quantity > MAX_LINE_VALUE) e.quantity = 'Aantal mag maximaal 9.999.999,99 zijn';
    if (line.unitPrice < 0) e.unitPrice = 'Eenheidsprijs mag niet negatief zijn';
    else if (line.unitPrice > MAX_LINE_VALUE) e.unitPrice = 'Eenheidsprijs mag maximaal € 9.999.999,99 zijn';
    if (line.discountPct < 0) e.discountPct = 'Korting mag niet negatief zijn';
    else if (line.discountPct > 100) e.discountPct = 'Korting mag maximaal 100% zijn';
    if (line.vatRate < 0) e.vatRate = 'Btw-tarief mag niet negatief zijn';
    else if (line.vatRate > 100) e.vatRate = 'Btw-tarief mag maximaal 100% zijn';
    if (Object.keys(e).length > 0) errors[line.key] = e;
  }
  return errors;
}

export default function QuoteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const isEditing = !!id;

  const { data: existingQuote, isLoading: quoteLoading } = useQuote(id || '');

  // Keep the offerte's in-window tab active + titled while editing on /quotes/:id/edit.
  // (`/quotes/new` has no id, so this is a no-op there.)
  useWindowTabSync('quote', id, {
    title: existingQuote?.quoteNumber,
    notFound: isEditing && !quoteLoading && !existingQuote,
  });

  const createMutation = useCreateQuote();
  const updateMutation = useUpdateQuote(id || '');

  const { data: productsData } = useProducts({ isActive: true, limit: 100 });
  const { data: templatesData } = useQuoteTemplates({ isActive: true, limit: 100 });

  const [selectedContactId, setSelectedContactId] = useState('');
  const { data: locationsData } = useContactLocations(selectedContactId);

  const [lines, setLines] = useState<EditorLine[]>([]);
  const [lineErrors, setLineErrors] = useState<Record<string, LineFieldErrors>>({});
  const [pendingProductId, setPendingProductId] = useState('');
  const [contentBlocks, setContentBlocks] = useState<object | null>(null);
  // Debounce-timers per regel voor de staffel-herberekening bij aantalwijziging (B-309).
  const priceTimersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const timers = priceTimersRef.current;
    return () => {
      Object.values(timers).forEach((t) => window.clearTimeout(t));
    };
  }, []);

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
            priceOverridden: false,
            priceSource: null,
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

  /** Prijs opvragen bij de prijstabel-resolver, mét expliciet aantal (B-309). */
  const fetchResolvedPrice = useCallback(
    async (productId: string, contactId: string, quantity: number): Promise<ResolvedPrice> => {
      const qs = new URLSearchParams();
      qs.set('productId', productId);
      qs.set('contactId', contactId);
      qs.set('quantity', String(quantity));
      return apiClient.get<ResolvedPrice>(`/quotes/resolve-price?${qs.toString()}`);
    },
    [],
  );

  const handleAddProduct = useCallback(async () => {
    if (!pendingProductId || !selectedContactId) {
      if (!selectedContactId) {
        showToast('Selecteer eerst een relatie', 'error');
      }
      return;
    }

    try {
      const resolved = await fetchResolvedPrice(pendingProductId, selectedContactId, 1);

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
          priceOverridden: false,
          priceSource: priceSourceLabel(resolved),
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
            priceOverridden: false,
            priceSource: null,
          },
        ]);
      }
      setPendingProductId('');
      showToast('Prijs kon niet worden opgehaald, vul handmatig in', 'error');
    }
  }, [pendingProductId, selectedContactId, products, showToast, fetchResolvedPrice]);

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
        priceOverridden: false,
        priceSource: null,
      },
    ]);
  };

  const handleRemoveLine = (key: string) => {
    if (priceTimersRef.current[key]) {
      window.clearTimeout(priceTimersRef.current[key]);
      delete priceTimersRef.current[key];
    }
    setLineErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  /**
   * Debounced staffel-herberekening (B-309): bij een aantalwijziging op een
   * productregel zonder handmatige prijsoverride wordt de eenheidsprijs opnieuw
   * geresolved (juiste tier). Handmatig gewijzigde prijzen worden nooit teruggezet.
   */
  const schedulePriceRefresh = useCallback(
    (key: string, productId: string, quantity: number) => {
      if (!selectedContactId) return;
      if (priceTimersRef.current[key]) window.clearTimeout(priceTimersRef.current[key]);
      priceTimersRef.current[key] = window.setTimeout(async () => {
        delete priceTimersRef.current[key];
        try {
          const resolved = await fetchResolvedPrice(productId, selectedContactId, quantity);
          setLines((prev) =>
            prev.map((l) =>
              l.key === key && !l.priceOverridden
                ? { ...l, unitPrice: resolved.unitPrice, priceSource: priceSourceLabel(resolved) }
                : l,
            ),
          );
        } catch {
          /* prijs blijft staan; geen harde fout bij een mislukte herberekening */
        }
      }, 400);
    },
    [selectedContactId, fetchResolvedPrice],
  );

  const handleLineChange = (key: string, field: keyof EditorLine, value: string | number) => {
    const line = lines.find((l) => l.key === key);
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        // Handmatige prijswijziging → override-vlag: de staffel-herberekening
        // mag deze prijs niet meer overschrijven (B-309).
        if (field === 'unitPrice') {
          return { ...l, unitPrice: value as number, priceOverridden: true, priceSource: null };
        }
        return { ...l, [field]: value };
      }),
    );
    // Veldfout wissen zodra de gebruiker het veld aanpast.
    setLineErrors((prev) => {
      const fieldErrors = prev[key];
      if (!fieldErrors || !(field in fieldErrors)) return prev;
      const nextFieldErrors = { ...fieldErrors };
      delete nextFieldErrors[field as LineField];
      const next = { ...prev };
      if (Object.keys(nextFieldErrors).length === 0) delete next[key];
      else next[key] = nextFieldErrors;
      return next;
    });
    if (field === 'quantity' && line?.productId && !line.priceOverridden) {
      schedulePriceRefresh(key, line.productId, Number(value) || 0);
    }
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
    // B-302: Nederlandse veldvalidatie op de regels — vervangt de native
    // (Engelstalige) browserbubbels; het formulier staat op noValidate.
    const errors = validateLines(lines);
    if (Object.keys(errors).length > 0) {
      setLineErrors(errors);
      showToast('Controleer de rood gemarkeerde offerteregels', 'error');
      return;
    }
    setLineErrors({});

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
          try {
            await apiClient.put(`/quotes/${quoteId}/lines`, linePayload);
          } catch (err) {
            // Rauwe API-call (geen useApiMutation) → toon de fout hier zelf.
            showToast(getErrorMessage(err, 'Offerteregels opslaan mislukt'), 'error');
            return;
          }
        } else {
          await setLinesMutation.mutateAsync(linePayload);
        }
      }

      showToast(isEditing ? 'Offerte bijgewerkt' : 'Offerte aangemaakt', 'success');
      navigate(`/quotes/${quoteId}`);
    } catch {
      /* mutatiefouten worden centraal getoond via useApiMutation */
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

      {/* noValidate: veldfouten komen als NL-meldingen uit zod/validateLines,
          niet als native browserbubbels in de taal van de browser (B-302). */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
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
                  {lines.map((line) => {
                    const errs = lineErrors[line.key] ?? {};
                    const inputClass = (field: LineField) =>
                      `w-full rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 ${
                        errs[field]
                          ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                          : 'border-gray-300 focus:border-primary-500 focus:ring-primary-500/20'
                      }`;
                    return (
                    <tr key={line.key}>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          className={inputClass('description')}
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
                          className={inputClass('quantity')}
                          value={line.quantity}
                          onChange={(e) =>
                            handleLineChange(line.key, 'quantity', parseFloat(e.target.value) || 0)
                          }
                        />
                        {errs.quantity && (
                          <p className="mt-0.5 text-xs text-red-600">{errs.quantity}</p>
                        )}
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
                          className={inputClass('unitPrice')}
                          value={line.unitPrice}
                          onChange={(e) =>
                            handleLineChange(line.key, 'unitPrice', parseFloat(e.target.value) || 0)
                          }
                        />
                        {errs.unitPrice && (
                          <p className="mt-0.5 text-xs text-red-600">{errs.unitPrice}</p>
                        )}
                        {!errs.unitPrice && line.priceSource && !line.priceOverridden && (
                          <p className="mt-0.5 text-xs text-gray-400" title="Prijs uit prijstabel">
                            {line.priceSource}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          className={inputClass('discountPct')}
                          value={line.discountPct}
                          onChange={(e) =>
                            handleLineChange(line.key, 'discountPct', parseFloat(e.target.value) || 0)
                          }
                        />
                        {errs.discountPct && (
                          <p className="mt-0.5 text-xs text-red-600">{errs.discountPct}</p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          className={inputClass('vatRate')}
                          value={line.vatRate}
                          onChange={(e) =>
                            handleLineChange(line.key, 'vatRate', parseFloat(e.target.value) || 0)
                          }
                        />
                        {errs.vatRate && (
                          <p className="mt-0.5 text-xs text-red-600">{errs.vatRate}</p>
                        )}
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
                    );
                  })}
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
