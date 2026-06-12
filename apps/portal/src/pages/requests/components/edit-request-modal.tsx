import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { useUpdateRequest, useOrgUsers } from '../hooks/use-requests';
import { Priority } from '@/types';
import type { Request } from '@/types';
import { getErrorMessage } from '@/lib/api-client';

const priorityOptions = [
  { value: Priority.LOW, label: 'Laag' },
  { value: Priority.NORMAL, label: 'Normaal' },
  { value: Priority.HIGH, label: 'Hoog' },
];

const schema = z.object({
  title: z.string().min(1, 'Titel is verplicht'),
  description: z.string().optional(),
  priority: z.nativeEnum(Priority),
  assignedTo: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface EditRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: Request;
}

export function EditRequestModal({ isOpen, onClose, request }: EditRequestModalProps) {
  const { showToast } = useToast();
  const updateMutation = useUpdateRequest(request.id);
  const { data: usersData } = useOrgUsers();

  const users = usersData || [];

  const userOptions = [
    { value: '', label: 'Niet toegewezen' },
    ...(Array.isArray(users)
      ? users.map((u) => ({
          value: u.id,
          label: `${u.firstName} ${u.lastName}`,
        }))
      : []),
  ];

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: request.title,
      description: request.description || '',
      priority: request.priority,
      assignedTo: request.assignedTo || '',
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await updateMutation.mutateAsync({
        title: data.title,
        description: data.description || undefined,
        priority: data.priority,
        assignedTo: data.assignedTo || undefined,
      });
      showToast('Aanvraag bijgewerkt!', 'success');
      onClose();
    } catch (err) {
      showToast(getErrorMessage(err, 'Bijwerken mislukt'), 'error');
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Aanvraag bewerken">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Titel"
          error={errors.title?.message}
          {...register('title')}
        />

        <Input
          label="Beschrijving"
          placeholder="Optionele toelichting"
          {...register('description')}
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Prioriteit"
            options={priorityOptions}
            {...register('priority')}
          />
          <Select
            label="Toewijzen aan"
            options={userOptions}
            {...register('assignedTo')}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={updateMutation.isPending}>
            Opslaan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
