import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/page-header';
import { Card, Button, Input, Select, ErrorBox, useToast } from '@/components/ui';
import { SUPPORT_TICKET_PRIORITY } from '@/lib/status';
import { useCreateTicket } from '../hooks/use-support-tickets';

const schema = z.object({
  subject: z.string().min(3, 'Onderwerp is verplicht'),
  description: z.string().min(5, 'Omschrijving is verplicht'),
  category: z.string(),
  priority: z.string(),
});
type FormData = z.infer<typeof schema>;

const CATEGORY_OPTIONS = [
  { value: 'VRAAG', label: 'Vraag' },
  { value: 'PROBLEEM', label: 'Probleem' },
  { value: 'BUG', label: 'Bug' },
  { value: 'FEATURE_REQUEST', label: 'Wens' },
  { value: 'FACTUUR', label: 'Factuur' },
  { value: 'OVERIG', label: 'Overig' },
];

const PRIORITY_OPTIONS = Object.entries(SUPPORT_TICKET_PRIORITY).map(
  ([value, cfg]) => ({ value, label: cfg.label }),
);

export default function NewTicketPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const create = useCreateTicket();
  const contextModule = params.get('module') || undefined;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { category: 'VRAAG', priority: 'NORMAAL' },
  });

  async function onSubmit(values: FormData) {
    try {
      const ticket = await create.mutateAsync({
        ...values,
        contextModule,
        contextUrl: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
      });
      showToast('Ticket aangemaakt', 'success');
      navigate(`/help/tickets/${ticket.id}`);
    } catch {
      showToast('Aanmaken mislukt', 'error');
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Nieuw ticket" description="Beschrijf je vraag of probleem." />
      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Onderwerp</label>
            <Input {...register('subject')} />
            {errors.subject && <ErrorBox>{errors.subject.message}</ErrorBox>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Omschrijving</label>
            <textarea
              {...register('description')}
              rows={6}
              className="w-full rounded-lg border border-gray-300 p-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
            {errors.description && <ErrorBox>{errors.description.message}</ErrorBox>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Categorie" options={CATEGORY_OPTIONS} {...register('category')} />
            <Select label="Prioriteit" options={PRIORITY_OPTIONS} {...register('priority')} />
          </div>
          {contextModule && (
            <p className="text-xs text-gray-500">Context: {contextModule}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/help/tickets')}
            >
              Annuleren
            </Button>
            <Button type="submit" isLoading={create.isPending}>
              Versturen
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
