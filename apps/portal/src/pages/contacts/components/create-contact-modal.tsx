import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ContactType } from '@/types';
import type { Contact } from '@/types';
import { Modal, Input, Button, useToast } from '@/components/ui';
import { useCreateContact } from '../hooks/use-contacts';

const contactSchema = z.object({
  type: z.nativeEnum(ContactType),
  companyName: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email('Ongeldig e-mailadres').optional().or(z.literal('')),
  phone: z.string().optional(),
  website: z.string().optional(),
  vatNumber: z.string().optional(),
  cocNumber: z.string().optional(),
  notes: z.string().optional(),
});

type ContactFormData = z.infer<typeof contactSchema>;

interface CreateContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the newly created contact after successful creation */
  onCreated?: (contact: Contact) => void;
}

export function CreateContactModal({ isOpen, onClose, onCreated }: CreateContactModalProps) {
  const { showToast } = useToast();
  const createMutation = useCreateContact();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      type: ContactType.COMPANY,
    },
  });

  const contactType = watch('type');

  const onSubmit = async (data: ContactFormData) => {
    try {
      // Remove empty strings
      const cleaned = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== '' && v !== undefined),
      ) as ContactFormData;
      const created = await createMutation.mutateAsync(cleaned);
      showToast('Relatie aangemaakt!', 'success');
      reset();
      onCreated?.(created);
      onClose();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Aanmaken mislukt',
        'error',
      );
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Relatie aanmaken">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Type toggle */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Type
          </label>
          <div className="flex rounded-lg border border-gray-300 p-1">
            <label
              className={`flex-1 cursor-pointer rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors ${
                contactType === ContactType.COMPANY
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                value={ContactType.COMPANY}
                {...register('type')}
                className="sr-only"
              />
              Bedrijf
            </label>
            <label
              className={`flex-1 cursor-pointer rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors ${
                contactType === ContactType.INDIVIDUAL
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                value={ContactType.INDIVIDUAL}
                {...register('type')}
                className="sr-only"
              />
              Particulier
            </label>
          </div>
        </div>

        {/* Conditional fields */}
        {contactType === ContactType.COMPANY ? (
          <>
            <Input
              label="Bedrijfsnaam"
              placeholder="Bouwbedrijf De Vries BV"
              error={errors.companyName?.message}
              {...register('companyName')}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="KvK-nummer"
                placeholder="12345678"
                {...register('cocNumber')}
              />
              <Input
                label="BTW-nummer"
                placeholder="NL123456789B01"
                {...register('vatNumber')}
              />
            </div>
            <Input
              label="Website"
              placeholder="https://bedrijf.nl"
              {...register('website')}
            />
          </>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Voornaam"
              placeholder="Jan"
              {...register('firstName')}
            />
            <Input
              label="Achternaam"
              placeholder="de Vries"
              {...register('lastName')}
            />
          </div>
        )}

        {/* Shared fields */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="E-mail"
            type="email"
            placeholder="info@bedrijf.nl"
            error={errors.email?.message}
            {...register('email')}
          />
          <Input
            label="Telefoon"
            placeholder="+31 20 123 4567"
            {...register('phone')}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Notities
          </label>
          <textarea
            {...register('notes')}
            rows={3}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            placeholder="Optionele opmerkingen..."
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
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
