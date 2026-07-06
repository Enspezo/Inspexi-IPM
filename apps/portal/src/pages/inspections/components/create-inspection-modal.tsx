// Aanmaak-modal voor een inspectieplan. Bij succes → navigeer naar de nieuwe detailpagina.
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { useContacts } from '@/pages/contacts/hooks/use-contacts';
import { useNormTypes } from '@/pages/norm-types/hooks/use-norm-types';
import { useSelectableUsers } from '@/pages/users/hooks/use-users';
import { useAuth } from '@/providers/auth-provider';
import { useLookups } from '@/lib/lookups';
import { ContactType, Role } from '@/types';
import type { Contact } from '@/types';
import { useCreateInspectionPlan } from '../hooks/use-inspections';

const schema = z.object({
  projectName: z.string().min(1, 'Projectnaam is verplicht'),
  contactId: z.string().min(1, 'Opdrachtgever is verplicht'),
  normTypeCode: z.string().min(1, 'Normtype is verplicht'),
  inspectionTypeCode: z.string().optional(),
  referenceNumber: z.string().optional(),
  plannedDate: z.string().optional(),
  deadline: z.string().optional(),
  assignedTo: z.string().optional(),
  addressStreet: z.string().optional(),
  addressHouseNumber: z.string().optional(),
  addressPostalCode: z.string().optional(),
  addressCity: z.string().optional(),
  gpsLatitude: z.string().optional(),
  gpsLongitude: z.string().optional(),
  description: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

function contactDisplayName(c: Contact): string {
  if (c.type === ContactType.COMPANY) return c.companyName || '—';
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateInspectionModal({ isOpen, onClose }: Props) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const createMutation = useCreateInspectionPlan();

  // Inspecteurs krijgen zichzelf voorgeselecteerd als toegewezen inspecteur.
  const defaultAssignedTo = user?.roles.includes(Role.INSPECTEUR) ? user.id : '';

  const { data: contactsData } = useContacts({ limit: 200 });
  const { data: normTypes } = useNormTypes();
  const { data: inspectionTypes } = useLookups('inspection-types');
  const { data: inspectors } = useSelectableUsers(Role.INSPECTEUR, { enabled: isOpen });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (isOpen) {
      reset({
        projectName: '',
        contactId: '',
        normTypeCode: '',
        inspectionTypeCode: '',
        referenceNumber: '',
        plannedDate: '',
        deadline: '',
        assignedTo: defaultAssignedTo,
        addressStreet: '',
        addressHouseNumber: '',
        addressPostalCode: '',
        addressCity: '',
        gpsLatitude: '',
        gpsLongitude: '',
        description: '',
      });
    }
  }, [isOpen, reset, defaultAssignedTo]);

  const contactOptions = useMemo(
    () => [
      { value: '', label: '— Kies opdrachtgever —' },
      ...(contactsData?.data ?? []).map((c) => ({ value: c.id, label: contactDisplayName(c) })),
    ],
    [contactsData],
  );

  const normTypeOptions = useMemo(
    () => [
      { value: '', label: '— Kies normtype —' },
      ...(normTypes ?? []).map((n) => ({ value: n.code, label: `${n.label} (${n.code})` })),
    ],
    [normTypes],
  );

  const inspectionTypeOptions = useMemo(
    () => [
      { value: '', label: '— Geen —' },
      ...(inspectionTypes ?? []).map((t) => ({ value: t.code, label: t.label })),
    ],
    [inspectionTypes],
  );

  const inspectorOptions = useMemo(
    () => [
      { value: '', label: '— Niet toegewezen —' },
      ...(inspectors ?? []).map((u) => ({
        value: u.id,
        label: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
      })),
    ],
    [inspectors],
  );

  const onSubmit = async (data: FormData) => {
    const lat = data.gpsLatitude?.trim() ? Number(data.gpsLatitude.replace(',', '.')) : undefined;
    const lng = data.gpsLongitude?.trim() ? Number(data.gpsLongitude.replace(',', '.')) : undefined;
    try {
      const created = await createMutation.mutateAsync({
        projectName: data.projectName,
        contactId: data.contactId,
        normTypeCode: data.normTypeCode,
        inspectionTypeCode: data.inspectionTypeCode || undefined,
        referenceNumber: data.referenceNumber || undefined,
        plannedDate: data.plannedDate || undefined,
        deadline: data.deadline || undefined,
        assignedTo: data.assignedTo || undefined,
        addressStreet: data.addressStreet || undefined,
        addressHouseNumber: data.addressHouseNumber || undefined,
        addressPostalCode: data.addressPostalCode || undefined,
        addressCity: data.addressCity || undefined,
        gpsLatitude: lat !== undefined && !Number.isNaN(lat) ? lat : undefined,
        gpsLongitude: lng !== undefined && !Number.isNaN(lng) ? lng : undefined,
        description: data.description || undefined,
      });
      showToast('Inspectie aangemaakt', 'success');
      onClose();
      navigate(`/inspections/${created.id}`);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nieuwe inspectie">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Projectnaam"
          placeholder="bijv. Keuring hoofdverdeler pand A"
          error={errors.projectName?.message}
          {...register('projectName')}
        />

        <Select
          label="Opdrachtgever"
          options={contactOptions}
          error={errors.contactId?.message}
          {...register('contactId')}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Normtype"
            options={normTypeOptions}
            error={errors.normTypeCode?.message}
            {...register('normTypeCode')}
          />
          <Select label="Inspectietype" options={inspectionTypeOptions} {...register('inspectionTypeCode')} />
        </div>

        <Input label="Referentienummer" placeholder="optioneel" {...register('referenceNumber')} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Geplande datum" type="date" {...register('plannedDate')} />
          <Input label="Deadline" type="date" {...register('deadline')} />
        </div>

        <Select label="Inspecteur" options={inspectorOptions} {...register('assignedTo')} />

        <div className="border-t border-gray-100 pt-4">
          <p className="mb-2 text-sm font-medium text-gray-700">Locatie (optioneel)</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Input label="Straat" {...register('addressStreet')} />
            </div>
            <Input label="Huisnummer" {...register('addressHouseNumber')} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Postcode" {...register('addressPostalCode')} />
            <Input label="Plaats" {...register('addressCity')} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="GPS-breedtegraad" placeholder="bijv. 52.3676" {...register('gpsLatitude')} />
            <Input label="GPS-lengtegraad" placeholder="bijv. 4.9041" {...register('gpsLongitude')} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Omschrijving</label>
          <textarea
            {...register('description')}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={createMutation.isPending}>
            Aanmaken
          </Button>
        </div>
      </form>
    </Modal>
  );
}
