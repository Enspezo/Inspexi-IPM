import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Role, DocumentEntityType, CustomFieldEntityType } from '@/types';
import { ActionMenu, Button, Card, ErrorBox, Spinner, Input, Select, useToast } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { AuditHistory } from '@/components/audit-history/audit-history';
import { DocumentsSection, UploadDocumentModal } from '@/components/documents';
import { CustomFieldsDisplay, CustomFieldsForm } from '@/components/custom-fields';
import { useAuth } from '@/providers/auth-provider';
import { useProduct, useUpdateProduct } from './hooks/use-products';
import { useProductGroupsCompact } from '@/pages/product-groups/hooks/use-product-groups';

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN];

const unitOptions = [
  { value: 'uur', label: 'Uur' },
  { value: 'stuks', label: 'Stuks' },
  { value: 'm2', label: 'm²' },
  { value: 'm', label: 'Meter' },
  { value: 'km', label: 'Kilometer' },
  { value: 'dag', label: 'Dag' },
  { value: 'traject', label: 'Traject' },
];

const schema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  unit: z.string().min(1, 'Eenheid is verplicht'),
  description: z.string().optional(),
  defaultVat: z.coerce.number().min(0).max(100),
  productGroupId: z.string().optional(),
  isActive: z.boolean(),
  customFields: z.record(z.any()).optional(),
});

type FormData = z.infer<typeof schema>;

function InfoField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value ?? '—'}</dd>
    </div>
  );
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isDocUploadOpen, setIsDocUploadOpen] = useState(false);

  const { data: product, isLoading, error } = useProduct(id!);
  const updateMutation = useUpdateProduct(id!);
  const { data: productGroups } = useProductGroupsCompact();

  const userCanWrite = user && user.roles.some(r => canWrite.includes(r));

  const groupOptions = [
    { value: '', label: '— Geen groep —' },
    ...(productGroups ?? []).map((g) => ({ value: g.id, label: g.name })),
  ];

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isDirty },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (product) {
      reset({
        name: product.name,
        unit: product.unit,
        description: product.description || '',
        defaultVat: product.defaultVat,
        productGroupId: product.productGroupId || '',
        isActive: product.isActive,
        customFields: product.customFields ?? {},
      } as any);
    }
  }, [product, reset]);

  const onSubmit = async (data: FormData) => {
    try {
      await updateMutation.mutateAsync({
        name: data.name,
        unit: data.unit,
        description: data.description || undefined,
        defaultVat: data.defaultVat,
        productGroupId: data.productGroupId || '',
        isActive: data.isActive,
        customFields: data.customFields,
      } as any);
      showToast('Product bijgewerkt', 'success');
      setIsEditing(false);
    } catch {
      showToast('Opslaan mislukt', 'error');
    }
  };

  const handleCancelEdit = () => {
    if (product) {
      reset({
        name: product.name,
        unit: product.unit,
        description: product.description || '',
        defaultVat: product.defaultVat,
        productGroupId: product.productGroupId || '',
        isActive: product.isActive,
        customFields: product.customFields ?? {},
      } as any);
    }
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <ErrorBox>{error?.message || 'Product niet gevonden'}</ErrorBox>
    );
  }

  const unitLabel = unitOptions.find((u) => u.value === product.unit)?.label ?? product.unit;

  return (
    <DetailPageLayout sidebar={<AuditHistory entityType="Product" entityId={id} />}>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/products')}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-gray-900">{product.name}</h2>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    product.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {product.isActive ? 'Actief' : 'Inactief'}
                </span>
              </div>
              {product.productGroup && (
                <p className="mt-0.5 text-sm text-gray-500">{product.productGroup.name}</p>
              )}
            </div>
          </div>

          {userCanWrite && !isEditing && (
            <ActionMenu
              secondaryActions={[
                {
                  label: 'Document uploaden',
                  icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>,
                  onClick: () => setIsDocUploadOpen(true),
                },
              ]}
            />
          )}
        </div>

        {/* Algemeen — read-only of bewerkformulier */}
        {isEditing ? (
          <Card>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input
                label="Naam"
                error={errors.name?.message}
                {...register('name')}
              />
              <Select
                label="Eenheid"
                options={unitOptions}
                error={errors.unit?.message}
                {...register('unit')}
              />
              <Input
                label="Beschrijving"
                {...register('description')}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="BTW %"
                  type="number"
                  error={errors.defaultVat?.message}
                  {...register('defaultVat')}
                />
                <Select
                  label="Productgroep"
                  options={groupOptions}
                  {...register('productGroupId')}
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  {...register('isActive')}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Actief</span>
              </label>
              <CustomFieldsForm
                entityType={CustomFieldEntityType.PRODUCT}
                register={register}
                errors={errors}
                control={control}
              />
              <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCancelEdit}
                  disabled={updateMutation.isPending}
                >
                  Annuleren
                </Button>
                <Button
                  type="submit"
                  isLoading={updateMutation.isPending}
                  disabled={!isDirty}
                >
                  Opslaan
                </Button>
              </div>
            </form>
          </Card>
        ) : (
          <Card>
            <div className="grid grid-cols-2 gap-6">
              <InfoField label="Naam" value={product.name} />
              <InfoField label="Eenheid" value={unitLabel} />
              <InfoField label="BTW %" value={`${product.defaultVat}%`} />
              <InfoField
                label="Productgroep"
                value={
                  product.productGroup ? (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                      {product.productGroup.name}
                    </span>
                  ) : (
                    '—'
                  )
                }
              />
              <div className="col-span-2">
                <InfoField label="Beschrijving" value={product.description} />
              </div>
              <InfoField
                label="Status"
                value={
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      product.isActive
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {product.isActive ? 'Actief' : 'Inactief'}
                  </span>
                }
              />
            </div>
          </Card>
        )}

        <CustomFieldsDisplay
          entityType={CustomFieldEntityType.PRODUCT}
          customFields={product.customFields}
        />

        {/* Documenten */}
        <Card>
          <DocumentsSection
            entityType={DocumentEntityType.PRODUCT}
            entityId={id!}
            canUpload={!!userCanWrite}
          />
        </Card>

        {/* Acties onderaan */}
        <div className="flex items-center justify-between border-t border-gray-200 pt-6">
          <p className="text-xs text-gray-400">
            Aangemaakt op {new Date(product.createdAt).toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
          {userCanWrite && !isEditing && (
            <Button variant="secondary" onClick={() => setIsEditing(true)}>
              Bewerken
            </Button>
          )}
        </div>

      </div>

      {isDocUploadOpen && (
        <UploadDocumentModal
          isOpen={isDocUploadOpen}
          onClose={() => setIsDocUploadOpen(false)}
          entityType={DocumentEntityType.PRODUCT}
          entityId={id!}
        />
      )}
    </DetailPageLayout>
  );
}
