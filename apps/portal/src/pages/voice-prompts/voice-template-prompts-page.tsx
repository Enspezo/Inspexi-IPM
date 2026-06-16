// Template-prompts (laag 2, ORG_ADMIN) — /voice-prompts/template.
// Lijst alle meetstaat-templates en koppelt per template de org-prompt (indien aanwezig).
// Bewerken/instellen + activeren (isActive) gaat via de editor-modal; verwijderen via de rij-actie.

import { useMemo, useState } from 'react';
import type { MeasurementSheetTemplate, VoiceTemplatePrompt } from '@/types';
import { Button, Card, ErrorBox, Input, Spinner, Table, useConfirm, useToast, type Column } from '@/components/ui';
import { PageHeader } from '@/components/layout/page-header';
import { getErrorMessage } from '@/lib/api-client';
import { useMeasurementSheetTemplates } from '@/pages/measurement-sheet-templates/hooks/use-measurement-sheet-templates';
import { useTemplatePrompts, useDeleteTemplatePrompt } from './hooks/use-template-prompts';
import { TemplatePromptEditorModal } from './components/template-prompt-editor-modal';

export default function VoiceTemplatePromptsPage() {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const templatesQuery = useMeasurementSheetTemplates();
  const promptsQuery = useTemplatePrompts();
  const deleteMutation = useDeleteTemplatePrompt();

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<{ id: string; name: string } | null>(null);

  // templateId → org-prompt
  const promptByTemplate = useMemo(() => {
    const map = new Map<string, VoiceTemplatePrompt>();
    (promptsQuery.data ?? []).forEach((p) => map.set(p.templateId, p));
    return map;
  }, [promptsQuery.data]);

  const openEditor = (t: MeasurementSheetTemplate) => {
    setActiveTemplate({ id: t.id, name: t.name });
    setModalOpen(true);
  };

  const handleDelete = async (t: MeasurementSheetTemplate) => {
    const confirmed = await confirm({
      title: 'Template-prompt verwijderen',
      message: `Weet je zeker dat je de voice-prompt voor "${t.name}" wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(t.id);
      showToast('Template-prompt verwijderd', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Verwijderen mislukt'), 'error');
    }
  };

  const columns: Column<MeasurementSheetTemplate>[] = [
    {
      key: 'name', header: 'Meetstaat-template',
      render: (t) => <span className="font-medium text-gray-900">{t.name}</span>,
    },
    {
      key: 'code', header: 'Code',
      render: (t) => <span className="font-mono text-xs text-gray-600">{t.code}</span>,
    },
    {
      key: 'normTypeCode', header: 'Normtype',
      render: (t) => <span className="text-gray-600">{t.normTypeCode}</span>,
    },
    {
      key: 'prompt', header: 'Voice-prompt',
      render: (t) => {
        const p = promptByTemplate.get(t.id);
        if (!p) return <span className="text-xs text-gray-400">Niet ingesteld</span>;
        return p.isActive ? (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
            Actief
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
            Inactief
          </span>
        );
      },
    },
    {
      key: 'actions', header: '',
      render: (t) => {
        const p = promptByTemplate.get(t.id);
        return (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => openEditor(t)}>
              {p ? 'Bewerken' : 'Instellen'}
            </Button>
            {p && (
              <Button variant="ghost" size="sm" onClick={() => handleDelete(t)}>Verwijderen</Button>
            )}
          </div>
        );
      },
    },
  ];

  const isLoading = templatesQuery.isLoading || promptsQuery.isLoading;
  const error = templatesQuery.error || promptsQuery.error;

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  if (error) return <ErrorBox>Fout bij het laden: {getErrorMessage(error, '')}</ErrorBox>;

  const rows = templatesQuery.data ?? [];
  const term = search.trim().toLowerCase();
  const searched = term
    ? rows.filter((r) => [r.name, r.code, r.normTypeCode].some((v) => v?.toLowerCase().includes(term)))
    : rows;

  const activePrompt = activeTemplate ? promptByTemplate.get(activeTemplate.id) ?? null : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Voice template-prompts"
        description="Org-instructies (laag 2) per meetstaat-template. Worden bovenop de actieve base-prompt toegevoegd bij spraakinvoer."
      />

      <div className="max-w-md">
        <Input
          placeholder="Zoeken op naam, code of normtype..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <Table
          columns={columns}
          data={searched}
          keyExtractor={(t) => t.id}
          emptyMessage="Geen meetstaat-templates gevonden"
        />
      </Card>

      <p className="text-sm text-gray-500">
        {searched.length} {searched.length !== 1 ? 'templates' : 'template'}
      </p>

      <TemplatePromptEditorModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        template={activeTemplate}
        prompt={activePrompt}
      />
    </div>
  );
}
