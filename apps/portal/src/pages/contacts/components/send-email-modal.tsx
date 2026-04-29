import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Button, useToast } from '@/components/ui';
import { useSendEmail } from '../hooks/use-contacts';

const emailSchema = z.object({
  subject: z.string().min(1, 'Onderwerp is verplicht'),
  bodyHtml: z.string().min(1, 'Bericht is verplicht'),
});

type EmailFormData = z.infer<typeof emailSchema>;

interface SendEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactId: string;
  contactEmail: string | null;
}

export function SendEmailModal({
  isOpen,
  onClose,
  contactId,
  contactEmail,
}: SendEmailModalProps) {
  const { showToast } = useToast();
  const sendMutation = useSendEmail(contactId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EmailFormData>({
    resolver: zodResolver(emailSchema),
  });

  const onSubmit = async (data: EmailFormData) => {
    try {
      await sendMutation.mutateAsync({
        subject: data.subject,
        bodyHtml: `<p>${data.bodyHtml.replace(/\n/g, '</p><p>')}</p>`,
      });
      showToast('E-mail verstuurd!', 'success');
      reset();
      onClose();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Versturen mislukt',
        'error',
      );
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="E-mail versturen">
      {!contactEmail ? (
        <div className="space-y-4">
          <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-medium">Geen e-mailadres</p>
            <p className="mt-1">
              Deze relatie heeft geen e-mailadres. Voeg eerst een e-mailadres toe
              voordat u een e-mail kunt versturen.
            </p>
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={handleClose}>
              Sluiten
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
            Aan: <span className="font-medium text-gray-900">{contactEmail}</span>
          </div>

          <Input
            label="Onderwerp"
            placeholder="Offerte inspectie"
            error={errors.subject?.message}
            {...register('subject')}
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Bericht
            </label>
            <textarea
              {...register('bodyHtml')}
              rows={8}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              placeholder="Beste klant,&#10;&#10;..."
            />
            {errors.bodyHtml && (
              <p className="mt-1 text-sm text-danger-600">
                {errors.bodyHtml.message}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Annuleren
            </Button>
            <Button type="submit" isLoading={sendMutation.isPending}>
              Versturen
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
