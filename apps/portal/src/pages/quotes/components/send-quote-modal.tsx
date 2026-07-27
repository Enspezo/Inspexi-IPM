import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Button, Input, useToast } from '@/components/ui';
import { useSendQuote } from '../hooks/use-quotes';
import type { Quote } from '@/types';

const schema = z.object({
  to: z.string().email('Ongeldig e-mailadres'),
  cc: z.string().optional(),
  subject: z.string().min(1, 'Onderwerp is verplicht'),
  bodyText: z.string().min(1, 'Begeleidende tekst is verplicht'),
});

type FormData = z.infer<typeof schema>;

interface SendQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  quote: Quote;
}

export function SendQuoteModal({ isOpen, onClose, quote }: SendQuoteModalProps) {
  const { showToast } = useToast();
  const sendMutation = useSendQuote(quote.id);
  // B-308: `mutation.isPending` wordt pas ná een re-render zichtbaar — twee snelle
  // klikken vallen in dezelfde render-batch. Deze ref blokkeert synchroon, vóór de await.
  const isSendingRef = useRef(false);

  const contactEmail = quote.contact?.email ?? '';
  const contactName = quote.contact?.companyName
    ? quote.contact.companyName
    : [quote.contact?.firstName, quote.contact?.lastName].filter(Boolean).join(' ');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      to: contactEmail,
      cc: '',
      subject: `Offerte ${quote.quoteNumber} — ${quote.subject}`,
      bodyText: `Beste ${contactName || 'relatie'},\n\nHierbij ontvangt u onze offerte ${quote.quoteNumber}.\n\nKlik op de knop in deze e-mail om de offerte te bekijken en digitaal te ondertekenen.\n\nMet vriendelijke groet`,
    },
  });

  const onSubmit = async (data: FormData) => {
    // Synchrone dubbelklik-guard (B-308): tweede submit in dezelfde render-batch
    // komt hier binnen vóórdat isPending true is — direct afbreken.
    if (isSendingRef.current) return;
    isSendingRef.current = true;

    const ccList = data.cc
      ? data.cc.split(',').map((e) => e.trim()).filter(Boolean)
      : undefined;

    try {
      await sendMutation.mutateAsync({
        to: data.to,
        cc: ccList,
        subject: data.subject,
        bodyText: data.bodyText,
      });
      showToast('Offerte verstuurd', 'success');
      onClose();
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    } finally {
      isSendingRef.current = false;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Offerte versturen">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Aan"
          placeholder="klant@bedrijf.nl"
          error={errors.to?.message}
          {...register('to')}
        />
        <Input
          label="CC (optioneel, komma-gescheiden)"
          placeholder="extra@bedrijf.nl, cc@bedrijf.nl"
          error={errors.cc?.message}
          {...register('cc')}
        />
        <Input
          label="Onderwerp"
          error={errors.subject?.message}
          {...register('subject')}
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Begeleidende tekst
          </label>
          <textarea
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            rows={8}
            {...register('bodyText')}
          />
          {errors.bodyText && (
            <p className="mt-1 text-xs text-red-600">{errors.bodyText.message}</p>
          )}
        </div>

        <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
          De klant ontvangt automatisch een directe link naar de offerte om deze te bekijken en te ondertekenen.
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={sendMutation.isPending}>
            Versturen
          </Button>
        </div>
      </form>
    </Modal>
  );
}
