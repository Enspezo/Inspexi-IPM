// Modal om een ondertekenverzoek aan te maken. De ondertekenaar krijgt een
// e-mail met een publieke link (/sign/:requestId).
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Button, Input, Select } from '@/components/ui';
import { useLookups } from '@/lib/lookups';
import type { RequestSignatureInput } from '../hooks/use-generated-documents';

const schema = z.object({
  signerRoleCode: z.string().min(1, 'Kies een rol'),
  signerName: z.string().min(1, 'Naam is verplicht'),
  signerEmail: z.string().email('Ongeldig e-mailadres'),
  signerFunction: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface RequestSignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  isSubmitting: boolean;
  onSubmit: (data: RequestSignatureInput) => Promise<void>;
}

export function RequestSignatureModal({
  isOpen,
  onClose,
  isSubmitting,
  onSubmit,
}: RequestSignatureModalProps) {
  const { data: roles } = useLookups('signer-roles');
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const roleOptions = [
    { value: '', label: '— Kies rol —' },
    ...(roles ?? []).map((r) => ({ value: r.code, label: r.label })),
  ];

  const submit = handleSubmit(async (data) => {
    await onSubmit({ ...data, signerFunction: data.signerFunction || undefined });
    reset();
  });

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Handtekening aanvragen">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-gray-600">
          De ondertekenaar ontvangt een e-mail met een beveiligde link om het document te ondertekenen.
        </p>
        <Select
          label="Rol"
          options={roleOptions}
          error={errors.signerRoleCode?.message}
          {...register('signerRoleCode')}
        />
        <Input label="Naam" error={errors.signerName?.message} {...register('signerName')} />
        <Input
          label="E-mailadres"
          type="email"
          error={errors.signerEmail?.message}
          {...register('signerEmail')}
        />
        <Input label="Functie (optioneel)" {...register('signerFunction')} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Verzoek versturen
          </Button>
        </div>
      </form>
    </Modal>
  );
}
