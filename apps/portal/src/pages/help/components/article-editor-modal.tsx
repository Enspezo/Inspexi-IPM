import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Button, Input, Select, useToast } from '@/components/ui';
import { HELP_MODULE_KEY_OPTIONS } from '@/lib/help-module-map';
import { HelpAudience, type HelpArticle, type HelpCategory } from '@/types';
import { useCreateHelpArticle, useUpdateHelpArticle } from '../hooks/use-help';

const schema = z.object({
  title: z.string().min(1, 'Titel is verplicht'),
  categoryId: z.string().min(1, 'Kies een categorie'),
  excerpt: z.string().optional(),
  body: z.string().min(1, 'Inhoud is verplicht'),
  tags: z.string().optional(),
  moduleKeys: z.array(z.string()).optional(),
  order: z.coerce.number().int().min(0).optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** null/undefined = nieuw artikel */
  article?: HelpArticle | null;
  /** Doelgroep voor een NIEUW artikel (bij bewerken volgt uit het artikel zelf). */
  audience?: HelpAudience;
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

export function ArticleEditorModal({
  isOpen,
  onClose,
  article,
  audience = HelpAudience.INTERNAL,
  categories,
}: Props) {
  const { showToast } = useToast();
  const create = useCreateHelpArticle();
  const update = useUpdateHelpArticle();
  const editing = !!article;
  // Bewerken: doelgroep uit het artikel; nieuw: de meegegeven audience.
  const effectiveAudience = article?.audience ?? audience;
  const isExternal = effectiveAudience === HelpAudience.EXTERNAL;
  // Alleen categorieën van dezelfde doelgroep zijn kiesbaar.
  const scopedCategories = categories.filter((c) => c.audience === effectiveAudience);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const selectedModuleKeys = watch('moduleKeys') ?? [];
  const toggleModuleKey = (key: string) =>
    setValue(
      'moduleKeys',
      selectedModuleKeys.includes(key)
        ? selectedModuleKeys.filter((k) => k !== key)
        : [...selectedModuleKeys, key],
      { shouldDirty: true },
    );

  useEffect(() => {
    if (isOpen) {
      reset({
        title: article?.title ?? '',
        categoryId: article?.categoryId ?? scopedCategories[0]?.id ?? '',
        excerpt: article?.excerpt ?? '',
        body: article?.body ?? '',
        tags: toCsv(article?.tags),
        moduleKeys: article?.moduleKeys ?? [],
        order: article?.order ?? 0,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, article, categories, effectiveAudience, reset]);

  const onSubmit = (data: FormData) => {
    // orgId bewust weggelaten: de backend forceert globaal (SUPERUSER) of eigen org (ORG_ADMIN)
    const payload: Partial<HelpArticle> = {
      title: data.title,
      categoryId: data.categoryId,
      excerpt: data.excerpt || undefined,
      body: data.body,
      tags: fromCsv(data.tags),
      // Externe artikelen koppelen niet aan modules (backend forceert dit ook).
      moduleKeys: isExternal ? [] : data.moduleKeys ?? [],
      order: data.order ?? 0,
      // audience alleen betekenisvol bij aanmaken; backend negeert het bij update.
      ...(editing ? {} : { audience: effectiveAudience }),
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

  const categoryOptions = scopedCategories.map((c) => ({
    value: c.id,
    label: c.orgId ? `${c.name} (org)` : c.name,
  }));

  const modalTitle = editing
    ? 'Artikel bewerken'
    : isExternal
      ? 'Nieuw extern artikel'
      : 'Nieuw artikel';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} className="max-w-2xl">
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
          {isExternal && categoryOptions.length === 0 && (
            <p className="-mt-2 text-xs text-amber-600">
              Er zijn nog geen externe categorieën. Maak eerst een externe categorie
              aan onder “Categorieën”.
            </p>
          )}
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
          <Input label="Tags (komma-gescheiden)" {...register('tags')} />
          {/* Externe (klantportaal) artikelen koppelen niet aan modules. */}
          {!isExternal && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Modules
              </label>
              <div className="flex flex-wrap gap-1.5">
                {HELP_MODULE_KEY_OPTIONS.map((opt) => {
                  const selected = selectedModuleKeys.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleModuleKey(opt.value)}
                      aria-pressed={selected}
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                        selected
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-gray-400">
                Bepaalt op welke pagina's dit artikel als contextuele suggestie
                verschijnt.
              </p>
            </div>
          )}
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
