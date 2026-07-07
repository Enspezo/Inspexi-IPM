import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PriceType, ContactType } from '@/types';
import type { PriceTableItem, PriceTier, Product, ContactSummary } from '@/types';
import { Button, Card, ErrorBox, Spinner, Select, useToast } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { usePriceTable, useSetPriceTableItems, useRemovePriceTableAssignment } from './hooks/use-price-tables';
import { useProducts } from '../products/hooks/use-products';
import { AuditHistory } from '@/components/audit-history/audit-history';
import { getErrorMessage } from '@/lib/api-client';

interface EditableItem {
  productId: string;
  priceType: PriceType;
  basePrice: number;
  tiers: { fromQty: number; toQty: number | null; price: number }[];
}

function getContactDisplayName(contact: ContactSummary): string {
  if (contact.type === ContactType.COMPANY) {
    return contact.companyName || '—';
  }
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—';
}

export default function PriceTableDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { data: priceTable, isLoading, error } = usePriceTable(id!);
  const { data: productsData } = useProducts({ limit: 100 });
  const setItemsMutation = useSetPriceTableItems(id!);
  const removeMutation = useRemovePriceTableAssignment(id!);

  const [items, setItems] = useState<EditableItem[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const products = productsData?.data || [];

  useEffect(() => {
    if (priceTable?.items) {
      setItems(
        priceTable.items.map((item: PriceTableItem) => ({
          productId: item.productId,
          priceType: item.priceType,
          basePrice: item.basePrice ?? 0,
          tiers: item.tiers?.map((t: PriceTier) => ({
            fromQty: t.fromQty,
            toQty: t.toQty,
            price: t.price,
          })) || [],
        })),
      );
      setIsDirty(false);
    }
  }, [priceTable]);

  const handleAddItem = () => {
    const usedProductIds = items.map((i) => i.productId);
    const available = products.filter((p: Product) => p.isActive && !usedProductIds.includes(p.id));
    if (available.length === 0) {
      showToast('Alle producten zijn al toegevoegd', 'error');
      return;
    }
    setItems([...items, {
      productId: available[0].id,
      priceType: PriceType.FIXED,
      basePrice: 0,
      tiers: [],
    }]);
    setIsDirty(true);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const handleItemChange = (index: number, field: keyof EditableItem, value: unknown) => {
    const updated = [...items];
    (updated[index] as unknown as Record<string, unknown>)[field] = value;
    if (field === 'priceType' && value === PriceType.TIERED && updated[index].tiers.length === 0) {
      updated[index].tiers = [{ fromQty: 1, toQty: null, price: 0 }];
    }
    setItems(updated);
    setIsDirty(true);
  };

  const handleTierChange = (itemIndex: number, tierIndex: number, field: string, value: number | null) => {
    const updated = [...items];
    (updated[itemIndex].tiers[tierIndex] as Record<string, unknown>)[field] = value;
    setItems(updated);
    setIsDirty(true);
  };

  const handleAddTier = (itemIndex: number) => {
    const updated = [...items];
    const lastTier = updated[itemIndex].tiers[updated[itemIndex].tiers.length - 1];
    const fromQty = lastTier ? (lastTier.toQty ?? lastTier.fromQty) + 1 : 1;
    updated[itemIndex].tiers.push({ fromQty, toQty: null, price: 0 });
    setItems(updated);
    setIsDirty(true);
  };

  const handleRemoveTier = (itemIndex: number, tierIndex: number) => {
    const updated = [...items];
    updated[itemIndex].tiers = updated[itemIndex].tiers.filter((_, i) => i !== tierIndex);
    setItems(updated);
    setIsDirty(true);
  };

  const handleSave = async () => {
    try {
      await setItemsMutation.mutateAsync(
        items.map((item) => ({
          productId: item.productId,
          priceType: item.priceType,
          basePrice: item.priceType === PriceType.FIXED ? item.basePrice : undefined,
          tiers: item.priceType === PriceType.TIERED
            ? item.tiers.map((t) => ({
                fromQty: t.fromQty,
                toQty: t.toQty ?? undefined,
                price: t.price,
              }))
            : undefined,
        })),
      );
      showToast('Prijzen opgeslagen!', 'success');
      setIsDirty(false);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleRemoveContact = async (contactId: string) => {
    try {
      await removeMutation.mutateAsync(contactId);
      showToast('Koppeling verwijderd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !priceTable) {
    return (
      <ErrorBox>{error?.message || 'Prijstabel niet gevonden'}</ErrorBox>
    );
  }

  const usedProductIds = items.map((i) => i.productId);

  return (
    <DetailPageLayout sidebar={<AuditHistory entityType="PriceTable" entityId={id} />}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/price-tables')}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900">{priceTable.name}</h2>
              {priceTable.isDefault && (
                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                  Standaard
                </span>
              )}
            </div>
            {priceTable.description && (
              <p className="mt-0.5 text-sm text-gray-500">{priceTable.description}</p>
            )}
          </div>
        </div>
        {isDirty && (
          <Button onClick={handleSave} isLoading={setItemsMutation.isPending}>
            Prijzen opslaan
          </Button>
        )}
      </div>

      {/* Items editor */}
      <Card title="Producten & Prijzen" actions={
        <Button size="sm" onClick={handleAddItem}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Product toevoegen
        </Button>
      }>
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            Nog geen producten aan deze prijstabel toegevoegd
          </p>
        ) : (
          <div className="space-y-4">
            {items.map((item, index) => {
              const product = products.find((p: Product) => p.id === item.productId);
              return (
                <div key={index} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="grid flex-1 grid-cols-3 gap-4">
                      {/* Product select */}
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">Product</label>
                        <select
                          value={item.productId}
                          onChange={(e) => handleItemChange(index, 'productId', e.target.value)}
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        >
                          {product && <option value={product.id}>{product.name}</option>}
                          {products
                            .filter((p: Product) => p.isActive && (p.id === item.productId || !usedProductIds.includes(p.id)))
                            .map((p: Product) => (
                              p.id !== item.productId ? <option key={p.id} value={p.id}>{p.name}</option> : null
                            ))}
                        </select>
                      </div>

                      {/* Price type */}
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500">Prijstype</label>
                        <select
                          value={item.priceType}
                          onChange={(e) => handleItemChange(index, 'priceType', e.target.value)}
                          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        >
                          <option value={PriceType.FIXED}>Vast</option>
                          <option value={PriceType.TIERED}>Staffel</option>
                        </select>
                      </div>

                      {/* Base price (only for FIXED) */}
                      {item.priceType === PriceType.FIXED && (
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-500">
                            Prijs per {product?.unit || 'eenheid'}
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.basePrice}
                            onChange={(e) => handleItemChange(index, 'basePrice', parseFloat(e.target.value) || 0)}
                            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                          />
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleRemoveItem(index)}
                      className="mt-6 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>

                  {/* Tiers (only for TIERED) */}
                  {item.priceType === PriceType.TIERED && (
                    <div className="mt-4 ml-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-gray-500">Staffelprijzen</label>
                        <button
                          onClick={() => handleAddTier(index)}
                          className="text-xs font-medium text-primary-600 hover:text-primary-800"
                        >
                          + Staffel toevoegen
                        </button>
                      </div>
                      {item.tiers.map((tier, ti) => (
                        <div key={ti} className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={tier.fromQty}
                              onChange={(e) => handleTierChange(index, ti, 'fromQty', parseFloat(e.target.value) || 0)}
                              className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm"
                              placeholder="Van"
                            />
                            <span className="text-xs text-gray-400">–</span>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={tier.toQty ?? ''}
                              onChange={(e) => handleTierChange(index, ti, 'toQty', e.target.value ? parseFloat(e.target.value) : null)}
                              className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm"
                              placeholder="∞"
                            />
                          </div>
                          <span className="text-xs text-gray-400">=</span>
                          <div className="flex items-center gap-1">
                            <span className="text-sm text-gray-500">€</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={tier.price}
                              onChange={(e) => handleTierChange(index, ti, 'price', parseFloat(e.target.value) || 0)}
                              className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
                            />
                          </div>
                          <button
                            onClick={() => handleRemoveTier(index, ti)}
                            className="rounded p-1 text-gray-400 hover:text-red-500"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Linked contacts */}
      <Card title="Gekoppelde relaties">
        {(!priceTable.contactPriceTables || priceTable.contactPriceTables.length === 0) ? (
          <p className="py-4 text-center text-sm text-gray-500">
            Geen relaties gekoppeld aan deze prijstabel
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {priceTable.contactPriceTables.map(({ contact }: { contact: ContactSummary }) => (
              <div key={contact.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {getContactDisplayName(contact)}
                  </p>
                  {contact.email && (
                    <p className="text-xs text-gray-500">{contact.email}</p>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveContact(contact.id)}
                  className="text-xs font-medium text-red-600 hover:text-red-800"
                >
                  Ontkoppelen
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
    </DetailPageLayout>
  );
}
