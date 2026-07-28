// Editor voor een base-prompt (laag 1). Aanmaken of bewerken van naam + inhoud.
// Activeren gebeurt NIET hier maar via de "Activeren"-knop in de lijst (exact één actief).

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Button, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import type { VoiceBasePrompt } from '@/types';
import { useCreateBasePrompt, useUpdateBasePrompt } from '../hooks/use-base-prompts';

const schema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  content: z.string().min(1, 'Inhoud is verplicht'),
});
type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Bestaande prompt → bewerk-modus; afwezig → aanmaak-modus. */
  prompt?: VoiceBasePrompt | null;
}

export function BasePromptEditorModal({ isOpen, onClose, prompt }: Props) {
  const { showToast } = useToast();
  const createMutation = useCreateBasePrompt();
  const updateMutation = useUpdateBasePrompt();
  const isEdit = !!prompt;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (isOpen) {
      reset({ name: prompt?.name ?? '', content: prompt?.content ?? '' });
    }
  }, [isOpen, prompt, reset]);

  const onSubmit = async (data: FormData) => {
    try {
      if (isEdit && prompt) {
        await updateMutation.mutateAsync({ id: prompt.id, data });
        showToast('Base-prompt bijgewerkt', 'success');
      } else {
        await createMutation.mutateAsync(data);
        showToast('Base-prompt aangemaakt (nog niet actief)', 'success');
      }
      onClose();
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Base-prompt bewerken' : 'Nieuwe base-prompt'}
      className="max-w-4xl"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Naam"
          placeholder="bijv. Standaard NL meetstaat-prompt"
          error={errors.name?.message}
          {...register('name')}
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Inhoud</label>
          <textarea
            {...register('content')}
            rows={22}
            spellCheck={false}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs leading-relaxed shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            placeholder="Systeem-instructies voor het omzetten van spraak naar meetwaarden..."
          />
          {errors.content?.message && (
            <p className="mt-1 text-sm text-danger-600">{errors.content.message}</p>
          )}
          <p className="mt-1.5 text-xs text-gray-500">
            Dit is laag 1 van de samengestelde prompt. Een nieuwe prompt is niet automatisch actief —
            gebruik "Activeren" in de lijst.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button
            type="submit"
            disabled={isEdit && !isDirty}
            isLoading={createMutation.isPending || updateMutation.isPending}
          >
            {isEdit ? 'Opslaan' : 'Aanmaken'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
