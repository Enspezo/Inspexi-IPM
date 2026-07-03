import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Button, Input, Select, Checkbox, useToast } from '@/components/ui';
import { HelpAudience, type HelpCategory } from '@/types';
import { useCreateHelpCategory, useUpdateHelpCategory } from '../hooks/use-help';

const schema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  description: z.string().optional(),
  icon: z.string().optional(),
  order: z.coerce.number().int().min(0).optional(),
  parentId: z.string().optional(),
  audience: z.nativeEnum(HelpAudience),
  isPublic: z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** null/undefined = nieuwe categorie */
  category?: HelpCategory | null;
  categories: HelpCategory[];
}

const AUDIENCE_OPTIONS = [
  { value: HelpAudience.INTERNAL, label: 'Intern (staff-portal)' },
  { value: HelpAudience.EXTERNAL, label: 'Extern (klantportaal)' },
];

export function CategoryEditorModal({ isOpen, onClose, category, categories }: Props) {
  const { showToast } = useToast();
  const create = useCreateHelpCategory();
  const update = useUpdateHelpCategory();
  const editing = !!category;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  // Doelgroep is bij bewerken onveranderlijk (zou artikelen ontkoppelen).
  const audience = watch('audience') ?? HelpAudience.INTERNAL;
  const isExternal = audience === HelpAudience.EXTERNAL;

  useEffect(() => {
    if (isOpen) {
      reset({
        name: category?.name ?? '',
        description: category?.description ?? '',
        icon: category?.icon ?? '',
        order: category?.order ?? 0,
        parentId: category?.parentId ?? '',
        audience: category?.audience ?? HelpAudience.INTERNAL,
        isPublic: category?.isPublic ?? false,
      });
    }
  }, [isOpen, category, reset]);

  const onSubmit = (data: FormData) => {
    // orgId bewust weggelaten: de backend forceert globaal (SUPERUSER) of eigen org (ORG_ADMIN)
    const payload: Partial<HelpCategory> = {
      name: data.name,
      description: data.description || undefined,
      icon: data.icon || undefined,
      order: data.order ?? 0,
      // lege keuze = hoofdcategorie; null wist een bestaande koppeling bij bewerken
      parentId: data.parentId ? data.parentId : null,
      // audience alleen bij aanmaken; backend negeert het bij update.
      ...(editing ? {} : { audience: data.audience }),
      // isPublic is alleen zinvol voor externe categorieën.
      isPublic: data.audience === HelpAudience.EXTERNAL ? !!data.isPublic : false,
    };
    const handlers = {
      onSuccess: () => {
        showToast(editing ? 'Categorie bijgewerkt' : 'Categorie aangemaakt', 'success');
        onClose();
      },
      onError: (e: unknown) =>
        showToast(e instanceof Error ? e.message : 'Opslaan mislukt', 'error'),
    };
    if (editing && category) {
      update.mutate({ id: category.id, data: payload }, handlers);
    } else {
      create.mutate(payload, handlers);
    }
  };

  // Een categorie kan zichzelf niet als bovenliggende categorie hebben; alleen
  // categorieën van dezelfde doelgroep zijn kiesbaar als ouder.
  const parentOptions = [
    { value: '', label: 'Geen (hoofdcategorie)' },
    ...categories
      .filter((c) => c.id !== category?.id && c.audience === audience)
      .map((c) => ({ value: c.id, label: c.orgId ? `${c.name} (org)` : c.name })),
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Categorie bewerken' : 'Nieuwe categorie'}
      className="max-w-lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <Input label="Naam" {...register('name')} error={errors.name?.message} />
          {editing ? (
            // Doelgroep is onveranderlijk na aanmaken.
            <Input
              label="Scope"
              value={isExternal ? 'Extern (klantportaal)' : 'Intern (staff-portal)'}
              disabled
              readOnly
            />
          ) : (
            <div>
              <Select
                label="Scope"
                options={AUDIENCE_OPTIONS}
                {...register('audience')}
              />
              <p className="mt-1 text-xs text-gray-400">
                Extern = zichtbaar in het klantportaal.
              </p>
            </div>
          )}
          {isExternal && (
            <Checkbox
              label="Publiek toegankelijk (zonder login zichtbaar op het klantportaal)"
              {...register('isPublic')}
            />
          )}
          <div className="w-full">
            <label
              htmlFor="help-cat-description"
              className="mb-1.5 block text-sm font-medium text-gray-700"
            >
              Omschrijving (optioneel)
            </label>
            <textarea
              id="help-cat-description"
              rows={3}
              {...register('description')}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Icoon (optioneel)"
              {...register('icon')}
              helperText="Naam van een icoon, bijv. 'book'"
            />
            <Input label="Volgorde" type="number" {...register('order')} />
          </div>
          <Select
            label="Bovenliggende categorie (optioneel)"
            options={parentOptions}
            {...register('parentId')}
          />
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
