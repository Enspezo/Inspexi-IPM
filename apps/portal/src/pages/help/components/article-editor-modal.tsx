import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Button, Input, Select, useToast } from '@/components/ui';
import type { HelpArticle, HelpCategory } from '@/types';
import { useCreateHelpArticle, useUpdateHelpArticle } from '../hooks/use-help';

const schema = z.object({
  title: z.string().min(1, 'Titel is verplicht'),
  categoryId: z.string().min(1, 'Kies een categorie'),
  excerpt: z.string().optional(),
  body: z.string().min(1, 'Inhoud is verplicht'),
  tags: z.string().optional(),
  moduleKeys: z.string().optional(),
  order: z.coerce.number().int().min(0).optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** null/undefined = nieuw artikel */
  article?: HelpArticle | null;
  categories: HelpCategory[];
}

const toCsv = (arr?: string[]) => (arr ?? []).join(', ');
const fromCsv = (s?: string) =>
  s
    ? s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    : [];

export function ArticleEditorModal({ isOpen, onClose, article, categories }: Props) {
  const { showToast } = useToast();
  const create = useCreateHelpArticle();
  const update = useUpdateHelpArticle();
  const editing = !!article;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (isOpen) {
      reset({
        title: article?.title ?? '',
        categoryId: article?.categoryId ?? categories[0]?.id ?? '',
        excerpt: article?.excerpt ?? '',
        body: article?.body ?? '',
        tags: toCsv(article?.tags),
        moduleKeys: toCsv(article?.moduleKeys),
        order: article?.order ?? 0,
      });
    }
  }, [isOpen, article, categories, reset]);

  const onSubmit = (data: FormData) => {
    // orgId bewust weggelaten: de backend forceert globaal (SUPERUSER) of eigen org (ORG_ADMIN)
    const payload: Partial<HelpArticle> = {
      title: data.title,
      categoryId: data.categoryId,
      excerpt: data.excerpt || undefined,
      body: data.body,
      tags: fromCsv(data.tags),
      moduleKeys: fromCsv(data.moduleKeys),
      order: data.order ?? 0,
    };
    const handlers = {
      onSuccess: () => {
        showToast(editing ? 'Artikel bijgewerkt' : 'Concept aangemaakt', 'success');
        onClose();
      },
    };
    if (editing && article) {
      update.mutate({ id: article.id, data: payload }, handlers);
    } else {
      create.mutate(payload, handlers);
    }
  };

  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: c.orgId ? `${c.name} (org)` : c.name,
  }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Artikel bewerken' : 'Nieuw artikel'}
      className="max-w-2xl"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <Input label="Titel" {...register('title')} error={errors.title?.message} />
          <Select
            label="Categorie"
            options={categoryOptions}
            placeholder="Kies een categorie"
            {...register('categoryId')}
            error={errors.categoryId?.message}
          />
          <Input
            label="Samenvatting (optioneel)"
            {...register('excerpt')}
            error={errors.excerpt?.message}
          />
          <div className="w-full">
            <label
              htmlFor="help-body"
              className="mb-1.5 block text-sm font-medium text-gray-700"
            >
              Inhoud (Markdown)
            </label>
            <textarea
              id="help-body"
              rows={12}
              {...register('body')}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
            {errors.body && (
              <p className="mt-1 text-sm text-danger-600">{errors.body.message}</p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Tags (komma-gescheiden)" {...register('tags')} />
            <Input
              label="Module-keys (komma-gescheiden)"
              {...register('moduleKeys')}
              helperText="Voor contextuele suggesties (Fase 3)"
            />
          </div>
          <Input label="Volgorde" type="number" {...register('order')} />
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={create.isPending || update.isPending}>
            {editing ? 'Opslaan' : 'Aanmaken'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
