// Golden-path detailpagina meetmiddel: DetailPageLayout + AuditHistory + tabs.
// Overzicht is inline bewerkbaar (canon: contact-detail-page).

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Button,
  Card,
  ErrorBox,
  InfoField,
  Input,
  Select,
  Spinner,
  StatusBadge,
  Tabs,
  useConfirm,
  useToast,
  type TabDef,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { AuditHistory } from '@/components/audit-history/audit-history';
import { useAuth } from '@/providers/auth-provider';
import { getErrorMessage } from '@/lib/api-client';
import { formatShortDate } from '@/lib/format';
import { MEETMIDDEL_KALIBRATIE_STATUS, MEETMIDDEL_STATUS } from '@/lib/status';
import { Role, MeasurementInstrumentStatus } from '@/types';
import { useSelectableUsers } from '@/pages/users/hooks/use-users';
import { useMeetmiddel, useUpdateMeetmiddel, useDeleteMeetmiddel } from './hooks/use-meetmiddelen';
import { KalibratiesTab } from './components/kalibraties-tab';

type Tab = 'overzicht' | 'kalibraties' | 'instellingen';

const WRITE_ROLES: Role[] = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.WERKVOORBEREIDER];

const STATUS_OPTIONS = [
  { value: 'ACTIEF', label: 'Actief' },
  { value: 'BUITEN_GEBRUIK', label: 'Buiten gebruik' },
  { value: 'AFGEKEURD', label: 'Afgekeurd' },
];

const schema = z.object({
  code: z.string().min(1, 'Nummer is verplicht').max(100),
  brand: z.string().min(1, 'Merk is verplicht').max(200),
  type: z.string().min(1, 'Type is verplicht').max(200),
  serialNumber: z.string().max(200).optional(),
  calibrationIntervalMonths: z.coerce.number().int().min(1).max(600),
  status: z.nativeEnum(MeasurementInstrumentStatus),
  assignedToUserId: z.string().optional(),
  notes: z.string().max(2000).optional(),
});
type FormData = z.infer<typeof schema>;

export default function MeetmiddelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const { data: instrument, isLoading, error } = useMeetmiddel(id);
  const { data: inspectors } = useSelectableUsers(Role.INSPECTEUR);
  const updateMutation = useUpdateMeetmiddel(id!);
  const deleteMutation = useDeleteMeetmiddel();

  const [activeTab, setActiveTab] = useState<Tab>('overzicht');
  const [isEditing, setIsEditing] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (instrument) {
      reset({
        code: instrument.code,
        brand: instrument.brand,
        type: instrument.type,
        serialNumber: instrument.serialNumber ?? '',
        calibrationIntervalMonths: instrument.calibrationIntervalMonths,
        status: instrument.status,
        assignedToUserId: instrument.assignedToUserId ?? '',
        notes: instrument.notes ?? '',
      });
    }
  }, [instrument, reset]);

  const canManage = !!user && user.roles.some((r) => WRITE_ROLES.includes(r));

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  if (error || !instrument) return <ErrorBox>Meetmiddel niet gevonden.</ErrorBox>;

  const assigneeOptions = [
    { value: '', label: 'Op voorraad (niet toegewezen)' },
    ...(inspectors ?? []).map((u) => ({
      value: u.id,
      label: `${u.firstName} ${u.lastName}`.trim() || u.email,
    })),
  ];

  const onSubmit = async (data: FormData) => {
    try {
      await updateMutation.mutateAsync({
        ...data,
        serialNumber: data.serialNumber || undefined,
        notes: data.notes || undefined,
        // Lege selectie = op voorraad → expliciet null om toewijzing op te heffen.
        assignedToUserId: data.assignedToUserId || null,
      });
      showToast('Meetmiddel bijgewerkt', 'success');
      setIsEditing(false);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Meetmiddel verwijderen',
      message: `Weet je zeker dat je "${instrument.code}" wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
    });
    if (!ok) return;
    try {
      await deleteMutation.mutateAsync(instrument.id);
      showToast('Meetmiddel verwijderd', 'success');
      navigate('/meetmiddelen');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const tabs: TabDef<Tab>[] = [
    { key: 'overzicht', label: 'Overzicht' },
    { key: 'kalibraties', label: 'Kalibraties', count: instrument.calibrationCount },
    ...(canManage ? [{ key: 'instellingen' as Tab, label: 'Instellingen' }] : []),
  ];

  const assigneeName = instrument.assignedTo
    ? `${instrument.assignedTo.firstName} ${instrument.assignedTo.lastName}`.trim()
    : 'Op voorraad';

  return (
    <DetailPageLayout sidebar={<AuditHistory entityType="MeasurementInstrument" entityId={instrument.id} />}>
      <div className="space-y-6">
        <div>
          <button
            onClick={() => navigate('/meetmiddelen')}
            className="mb-2 text-sm text-gray-500 hover:text-gray-700"
          >
            ← Terug naar meetmiddelen
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{instrument.code}</h1>
            <StatusBadge map={MEETMIDDEL_KALIBRATIE_STATUS} status={instrument.calibrationStatus ?? 'GEEN_KALIBRATIE'} />
            <StatusBadge map={MEETMIDDEL_STATUS} status={instrument.status} />
          </div>
          <p className="text-gray-500">{instrument.brand} {instrument.type}</p>
        </div>

        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

        {activeTab === 'overzicht' && (
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-medium text-gray-900">Gegevens</h2>
              {canManage && !isEditing && (
                <Button variant="secondary" onClick={() => setIsEditing(true)}>Bewerken</Button>
              )}
            </div>

            {isEditing ? (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Nummer" error={errors.code?.message} {...register('code')} />
                  <Input label="Interval (maanden)" type="number" error={errors.calibrationIntervalMonths?.message} {...register('calibrationIntervalMonths')} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Merk" error={errors.brand?.message} {...register('brand')} />
                  <Input label="Type" error={errors.type?.message} {...register('type')} />
                </div>
                <Input label="Serienummer" error={errors.serialNumber?.message} {...register('serialNumber')} />
                <div className="grid grid-cols-2 gap-4">
                  <Select label="Status" options={STATUS_OPTIONS} error={errors.status?.message} {...register('status')} />
                  <Select label="Toegewezen aan" options={assigneeOptions} {...register('assignedToUserId')} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Notitie</label>
                  <textarea
                    rows={2}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
                    {...register('notes')}
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <Button type="button" variant="secondary" onClick={() => { reset(); setIsEditing(false); }}>
                    Annuleren
                  </Button>
                  <Button type="submit" disabled={!isDirty} isLoading={updateMutation.isPending}>Opslaan</Button>
                </div>
              </form>
            ) : (
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <InfoField label="Nummer" value={instrument.code} />
                <InfoField label="Merk" value={instrument.brand} />
                <InfoField label="Type" value={instrument.type} />
                <InfoField label="Serienummer" value={instrument.serialNumber} />
                <InfoField label="Kalibratie-interval" value={`${instrument.calibrationIntervalMonths} maanden`} />
                <InfoField label="Toegewezen aan" value={assigneeName} />
                <InfoField label="Laatste kalibratie" value={formatShortDate(instrument.lastCalibrationDate)} />
                <InfoField label="Verloopt" value={formatShortDate(instrument.nextCalibrationDue)} />
                <InfoField label="Notitie" value={instrument.notes} />
              </dl>
            )}
          </Card>
        )}

        {activeTab === 'kalibraties' && (
          <Card>
            <KalibratiesTab instrumentId={instrument.id} canEdit={canManage} />
          </Card>
        )}

        {activeTab === 'instellingen' && canManage && (
          <Card>
            <h2 className="mb-1 text-lg font-medium text-gray-900">Gevarenzone</h2>
            <p className="mb-4 text-sm text-gray-500">
              Het meetmiddel wordt verwijderd (soft-delete). Kalibraties blijven bewaard maar zijn niet meer zichtbaar.
            </p>
            <Button variant="danger" onClick={handleDelete} isLoading={deleteMutation.isPending}>
              Meetmiddel verwijderen
            </Button>
          </Card>
        )}
      </div>
    </DetailPageLayout>
  );
}
