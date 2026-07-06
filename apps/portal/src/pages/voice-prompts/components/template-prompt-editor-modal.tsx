// Editor voor een template-prompt (laag 2) op één meetstaat-template.
// Upsert via PUT /voice-prompts/template/:templateId — de backend leidt de org af uit user.orgId.

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Button, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import type { VoiceTemplatePrompt } from '@/types';
import { useUpsertTemplatePrompt } from '../hooks/use-template-prompts';

const schema = z.object({
  content: z.string().min(1, 'Inhoud is verplicht'),
  isActive: z.boolean(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Meetstaat-template waarop de prompt hoort. */
  template: { id: string; name: string } | null;
  /** Bestaande prompt voor dit template, indien aanwezig. */
  prompt?: VoiceTemplatePrompt | null;
}

export function TemplatePromptEditorModal({ isOpen, onClose, template, prompt }: Props) {
  const { showToast } = useToast();
  const upsertMutation = useUpsertTemplatePrompt();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (isOpen) {
      reset({ content: prompt?.content ?? '', isActive: prompt?.isActive ?? true });
    }
  }, [isOpen, prompt, reset]);

  const onSubmit = async (data: FormData) => {
    if (!template) return;
    try {
      await upsertMutation.mutateAsync({ templateId: template.id, data });
      showToast('Template-prompt opgeslagen', 'success');
      onClose();
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={template ? `Voice-prompt — ${template.name}` : 'Voice-prompt'}
      className="max-w-3xl"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Inhoud</label>
          <textarea
            {...register('content')}
            rows={14}
            spellCheck={false}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs leading-relaxed shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            placeholder="Extra instructies specifiek voor dit meetstaat-template..."
          />
          {errors.content?.message && (
            <p className="mt-1 text-sm text-danger-600">{errors.content.message}</p>
          )}
          <p className="mt-1.5 text-xs text-gray-500">
            Deze instructies (laag 2) worden bovenop de actieve base-prompt toegevoegd bij spraakinvoer
            voor dit template.
          </p>
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            {...register('isActive')}
          />
          Actief (toepassen bij spraakinvoer)
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" disabled={!isDirty} isLoading={upsertMutation.isPending}>
            Opslaan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
