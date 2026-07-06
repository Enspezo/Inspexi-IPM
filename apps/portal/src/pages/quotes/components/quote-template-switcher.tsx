import { useState } from 'react';
import type { Quote } from '@/types';
import { Select, useConfirm } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { useQuoteTemplates } from '../hooks/use-quote-templates';
import type { useUpdateQuote } from '../hooks/use-quotes';

const NO_TEMPLATE = '';

/**
 * Inline template switcher shown on the quote detail page. Only rendered while
 * the quote is editable (CONCEPT). Switching to another template re-applies its
 * content blocks (after a confirmation); offerteregels stay untouched.
 */
export function QuoteTemplateSwitcher({
  quote,
  updateQuoteMutation,
  showToast,
}: {
  quote: Quote;
  updateQuoteMutation: ReturnType<typeof useUpdateQuote>;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const confirm = useConfirm();
  const { data: templatesData } = useQuoteTemplates({ isActive: true, limit: 200 });
  const [isSaving, setIsSaving] = useState(false);

  const templates = templatesData?.data ?? [];
  const currentValue = quote.templateId ?? NO_TEMPLATE;

  const options = [
    { value: NO_TEMPLATE, label: 'Geen sjabloon' },
    ...templates.map((t) => ({ value: t.id, label: t.name })),
  ];
  // Keep the currently linked template selectable even if it is now inactive.
  if (quote.template && !templates.some((t) => t.id === quote.template!.id)) {
    options.push({ value: quote.template.id, label: `${quote.template.name} (inactief)` });
  }

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (next === currentValue) return;

    const confirmed = await confirm({
      title: next === NO_TEMPLATE ? 'Sjabloon ontkoppelen' : 'Sjabloon wijzigen',
      message:
        next === NO_TEMPLATE
          ? 'Hiermee ontkoppelt u het sjabloon. De offerteregels blijven behouden. Let op: de status kan niet vooruit zonder gekoppeld sjabloon.'
          : 'Hiermee worden de inhoudsblokken vervangen door het nieuwe sjabloon; offerteregels blijven behouden.',
      confirmLabel: next === NO_TEMPLATE ? 'Ontkoppelen' : 'Vervangen',
    });
    if (!confirmed) return;

    setIsSaving(true);
    try {
      await updateQuoteMutation.mutateAsync({ templateId: next === NO_TEMPLATE ? null : next });
      showToast(next === NO_TEMPLATE ? 'Sjabloon ontkoppeld' : 'Sjabloon gewijzigd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Select
      value={currentValue}
      options={options}
      onChange={handleChange}
      disabled={isSaving}
      aria-label="Sjabloon"
    />
  );
}
