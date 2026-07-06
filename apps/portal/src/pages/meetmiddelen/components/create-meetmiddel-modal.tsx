import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input, Modal, Select, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { Role, MeasurementInstrumentStatus } from '@/types';
import { useSelectableUsers } from '@/pages/users/hooks/use-users';
import { useCreateMeetmiddel, useInstrumentSuggestions } from '../hooks/use-meetmiddelen';

const schema = z.object({
  code: z.string().min(1, 'Nummer is verplicht').max(100, 'Maximaal 100 tekens'),
  brand: z.string().min(1, 'Merk is verplicht').max(200, 'Maximaal 200 tekens'),
  type: z.string().min(1, 'Type is verplicht').max(200, 'Maximaal 200 tekens'),
  serialNumber: z.string().max(200, 'Maximaal 200 tekens').optional(),
  calibrationIntervalMonths: z.coerce
    .number({ invalid_type_error: 'Vul een aantal maanden in' })
    .int('Geheel aantal maanden')
    .min(1, 'Minimaal 1 maand')
    .max(600, 'Maximaal 600 maanden'),
  status: z.nativeEnum(MeasurementInstrumentStatus),
  assignedToUserId: z.string().optional(),
  notes: z.string().max(2000, 'Maximaal 2000 tekens').optional(),
});

type FormData = z.infer<typeof schema>;

const STATUS_OPTIONS = [
  { value: 'ACTIEF', label: 'Actief' },
  { value: 'BUITEN_GEBRUIK', label: 'Buiten gebruik' },
  { value: 'AFGEKEURD', label: 'Afgekeurd' },
];

interface CreateMeetmiddelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateMeetmiddelModal({ isOpen, onClose }: CreateMeetmiddelModalProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const createMutation = useCreateMeetmiddel();
  const { data: inspectors } = useSelectableUsers(Role.INSPECTEUR);
  const { data: brandSuggestions } = useInstrumentSuggestions('brand');
  const { data: typeSuggestions } = useInstrumentSuggestions('type');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { status: MeasurementInstrumentStatus.ACTIEF, assignedToUserId: '' },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        code: '',
        brand: '',
        type: '',
        serialNumber: '',
        calibrationIntervalMonths: 12,
        status: MeasurementInstrumentStatus.ACTIEF,
        assignedToUserId: '',
        notes: '',
      });
    }
  }, [isOpen, reset]);

  const assigneeOptions = [
    { value: '', label: 'Op voorraad (niet toegewezen)' },
    ...(inspectors ?? []).map((u) => ({
      value: u.id,
      label: `${u.firstName} ${u.lastName}`.trim() || u.email,
    })),
  ];

  const onSubmit = async (data: FormData) => {
    try {
      const created = await createMutation.mutateAsync({
        ...data,
        serialNumber: data.serialNumber || undefined,
        notes: data.notes || undefined,
        assignedToUserId: data.assignedToUserId || undefined,
      });
      showToast('Meetmiddel aangemaakt', 'success');
      onClose();
      navigate(`/meetmiddelen/${created.id}`);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nieuw meetmiddel">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Nummer" placeholder="bv. MM-001" error={errors.code?.message} {...register('code')} />
          <Input
            label="Interval (maanden)"
            type="number"
            error={errors.calibrationIntervalMonths?.message}
            {...register('calibrationIntervalMonths')}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Input label="Merk" list="mm-brand-suggestions" error={errors.brand?.message} {...register('brand')} />
            <datalist id="mm-brand-suggestions">
              {(brandSuggestions ?? []).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div>
            <Input label="Type" list="mm-type-suggestions" error={errors.type?.message} {...register('type')} />
            <datalist id="mm-type-suggestions">
              {(typeSuggestions ?? []).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
        </div>

        <Input label="Serienummer" placeholder="optioneel" error={errors.serialNumber?.message} {...register('serialNumber')} />

        <div className="grid grid-cols-2 gap-4">
          <Select label="Status" options={STATUS_OPTIONS} error={errors.status?.message} {...register('status')} />
          <Select label="Toegewezen aan" options={assigneeOptions} {...register('assignedToUserId')} />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Notitie</label>
          <textarea
            rows={2}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
            placeholder="optioneel"
            {...register('notes')}
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
