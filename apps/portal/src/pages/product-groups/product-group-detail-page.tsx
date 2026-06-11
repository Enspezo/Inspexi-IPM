import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Role } from '@/types';
import { Button, ErrorBox, Spinner, useToast } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { useAuth } from '@/providers/auth-provider';
import {
  useProductGroup,
  useUpdateProductGroup,
  useDeleteProductGroup,
  useAddProductToGroup,
  useRemoveProductFromGroup,
} from './hooks/use-product-groups';
import { useProducts } from '@/pages/products/hooks/use-products';
import { AuditHistory } from '@/components/audit-history/audit-history';

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN];
const canDelete = [Role.SUPERUSER, Role.ORG_ADMIN];

export default function ProductGroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const { data: group, isLoading, error } = useProductGroup(id!);
  const updateMutation = useUpdateProductGroup(id!);
  const deleteMutation = useDeleteProductGroup();
  const addProductMutation = useAddProductToGroup(id!);
  const removeProductMutation = useRemoveProductFromGroup(id!);

  const userCanWrite = user && user.roles.some(r => canWrite.includes(r));
  const userCanDelete = user && user.roles.some(r => canDelete.includes(r));

  const handleDelete = async () => {
    if (!group) return;
    if (!window.confirm('Weet u zeker dat u deze productgroep wilt verwijderen?'))
      return;
    try {
      await deleteMutation.mutateAsync(group.id);
      showToast('Productgroep verwijderd', 'success');
      navigate('/products/groups');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Verwijderen mislukt',
        'error',
      );
    }
  };

  const handleAddProduct = async (productId: string) => {
    try {
      await addProductMutation.mutateAsync(productId);
      showToast('Product toegevoegd aan groep', 'success');
    } catch {
      showToast('Toevoegen mislukt', 'error');
    }
  };

  const handleRemoveProduct = async (productId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Product verwijderen uit deze productgroep?')) return;
    try {
      await removeProductMutation.mutateAsync(productId);
      showToast('Product verwijderd uit groep', 'success');
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

  if (error || !group) {
    return (
      <ErrorBox>{error?.message || 'Productgroep niet gevonden'}</ErrorBox>
    );
  }

  const products = group.products ?? [];
  const productIds = new Set(products.map((p) => p.id));

  return (
    <DetailPageLayout sidebar={<AuditHistory entityType="ProductGroup" entityId={id} />}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/products/groups')}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{group.name}</h2>
              <InlineNotes
                value={group.notes || ''}
                canEdit={!!userCanWrite}
                onSave={async (notes) => {
                  try {
                    await updateMutation.mutateAsync({ notes: notes || undefined });
                  } catch {
                    showToast('Notities opslaan mislukt', 'error');
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Product toevoegen */}
        {userCanWrite && (
          <ProductSearchAdd
            groupId={id!}
            existingProductIds={productIds}
            onAdd={handleAddProduct}
            isAdding={addProductMutation.isPending}
          />
        )}

        {/* Producten in deze groep */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-gray-900">
            Producten ({products.length})
          </h3>
          {products.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Nog geen producten in deze productgroep
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Naam
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Eenheid
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      BTW %
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Omschrijving
                    </th>
                    {userCanWrite && (
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                        Acties
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {products.map((product) => (
                    <tr
                      key={product.id}
                      className="hover:bg-gray-50"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium">
                        <button
                          type="button"
                          onClick={() => navigate(`/products/${product.id}`)}
                          className="text-primary-600 hover:text-primary-800 hover:underline"
                        >
                          {product.name}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {product.unit}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {product.defaultVat}%
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        <span className="block max-w-xs truncate">
                          {product.description || '—'}
                        </span>
                      </td>
                      {userCanWrite && (
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                          <button
                            onClick={(e) => handleRemoveProduct(product.id, e)}
                            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title="Verwijderen uit groep"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Verwijderen */}
        {userCanDelete && (
          <div className="flex justify-end border-t border-gray-200 pt-6">
            <Button variant="danger" size="sm" onClick={handleDelete}>
              Productgroep verwijderen
            </Button>
          </div>
        )}
      </div>

    </DetailPageLayout>
  );
}

// ─── Search & Add Product Component ─────────────────────

function ProductSearchAdd({
  groupId,
  existingProductIds,
  onAdd,
  isAdding,
}: {
  groupId: string;
  existingProductIds: Set<string>;
  onAdd: (productId: string) => Promise<void>;
  isAdding: boolean;
}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { data, isLoading } = useProducts({
    search: debouncedSearch || undefined,
    isActive: true,
    limit: 10,
  });

  const results = (data?.data || []).filter((p) => !existingProductIds.has(p.id));

  const handleSelect = async (productId: string) => {
    await onAdd(productId);
    setSearch('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={wrapperRef} className="relative">
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        Product toevoegen aan groep
      </label>
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          placeholder="Zoek op productnaam..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (search.length > 0) setIsOpen(true);
          }}
        />
      </div>

      {isOpen && search.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Spinner size="sm" />
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500">
              {debouncedSearch ? 'Geen producten gevonden' : 'Begin met typen om te zoeken...'}
            </div>
          ) : (
            <ul className="max-h-60 overflow-y-auto py-1">
              {results.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    disabled={isAdding}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-gray-50 disabled:opacity-50"
                    onClick={() => handleSelect(product.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-gray-900">{product.name}</p>
                      <p className="truncate text-xs text-gray-500">
                        {product.unit}
                        {product.description ? ` · ${product.description}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {product.defaultVat}% btw
                    </span>
                    <svg className="h-4 w-4 shrink-0 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Inline Editable Notes ──────────────────────────────

function InlineNotes({
  value,
  canEdit,
  onSave,
}: {
  value: string;
  canEdit: boolean;
  onSave: (notes: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(value); }, [value]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (draft === value) { setIsEditing(false); return; }
    setIsSaving(true);
    try {
      await onSave(draft);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
    if (e.key === 'Escape') { setDraft(value); setIsEditing(false); }
  };

  if (isEditing) {
    return (
      <div className="mt-1">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          rows={2}
          className="w-full resize-none rounded border border-primary-300 bg-white px-2 py-1 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50"
          placeholder="Notities toevoegen..."
        />
        <p className="mt-0.5 text-xs text-gray-400">Enter om op te slaan · Esc om te annuleren</p>
      </div>
    );
  }

  if (!canEdit) {
    return value ? <p className="mt-0.5 text-sm text-gray-500">{value}</p> : null;
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      className="mt-0.5 text-left text-sm text-gray-500 underline decoration-gray-300 decoration-dashed underline-offset-2 transition-colors hover:text-gray-700 hover:decoration-gray-400"
    >
      {value || 'Notities toevoegen...'}
    </button>
  );
}
