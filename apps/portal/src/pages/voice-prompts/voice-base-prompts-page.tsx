// Base-prompts (laag 1, SUPERUSER) — /admin/voice-prompts onder "Inspectie-systeem".
// Lijst + editor (modal) + activeren. Exact één prompt is actief; activeren deactiveert de rest.

import { useState } from 'react';
import type { VoiceBasePrompt } from '@/types';
import { Button, Card, ErrorBox, Spinner, Table, useConfirm, useToast, type Column } from '@/components/ui';
import { PageHeader } from '@/components/layout/page-header';
import { getErrorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { useBasePrompts, useActivateBasePrompt, useDeleteBasePrompt } from './hooks/use-base-prompts';
import { BasePromptEditorModal } from './components/base-prompt-editor-modal';

export default function VoiceBasePromptsPage() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { data, isLoading, error } = useBasePrompts();
  const activateMutation = useActivateBasePrompt();
  const deleteMutation = useDeleteBasePrompt();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<VoiceBasePrompt | null>(null);

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (p: VoiceBasePrompt) => { setEditing(p); setModalOpen(true); };

  const handleActivate = async (p: VoiceBasePrompt) => {
    const confirmed = await confirm({
      title: 'Base-prompt activeren',
      message: `"${p.name}" wordt de actieve systeem-prompt. De huidige actieve prompt wordt gedeactiveerd.`,
      confirmLabel: 'Activeren',
    });
    if (!confirmed) return;
    try {
      await activateMutation.mutateAsync(p.id);
      showToast('Base-prompt geactiveerd', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Activeren mislukt'), 'error');
    }
  };

  const handleDelete = async (p: VoiceBasePrompt) => {
    const confirmed = await confirm({
      title: 'Base-prompt verwijderen',
      message: `Weet je zeker dat je "${p.name}" wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(p.id);
      showToast('Base-prompt verwijderd', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Verwijderen mislukt'), 'error');
    }
  };

  const columns: Column<VoiceBasePrompt>[] = [
    {
      key: 'name', header: 'Naam',
      render: (p) => <span className="font-medium text-gray-900">{p.name}</span>,
    },
    {
      key: 'version', header: 'Versie',
      render: (p) => <span className="font-mono text-xs text-gray-600">v{p.version}</span>,
    },
    {
      key: 'isActive', header: 'Status',
      render: (p) =>
        p.isActive ? (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
            Actief
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
            Inactief
          </span>
        ),
    },
    {
      key: 'updatedAt', header: 'Bijgewerkt',
      render: (p) => <span className="text-xs text-gray-500">{formatDateTime(p.updatedAt)}</span>,
    },
    {
      key: 'actions', header: '',
      render: (p) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>Bewerken</Button>
          {!p.isActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleActivate(p)}
              isLoading={activateMutation.isPending && activateMutation.variables === p.id}
            >
              Activeren
            </Button>
          )}
          {!p.isActive && (
            <Button variant="ghost" size="sm" onClick={() => handleDelete(p)}>Verwijderen</Button>
          )}
        </div>
      ),
    },
  ];

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  if (error) return <ErrorBox>Fout bij het laden: {getErrorMessage(error, '')}</ErrorBox>;

  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Voice base-prompts"
        description="Systeem-instructies (laag 1) die spraak omzetten naar meetwaarden. Eén prompt is actief; org- en gebruikersprompts worden hierop gestapeld."
        actions={<Button onClick={openCreate}>Nieuwe base-prompt</Button>}
      />

      <Card>
        <Table
          columns={columns}
          data={rows}
          keyExtractor={(p) => p.id}
          emptyMessage="Nog geen base-prompts — maak er één aan en activeer hem."
        />
      </Card>

      <BasePromptEditorModal isOpen={modalOpen} onClose={() => setModalOpen(false)} prompt={editing} />
    </div>
  );
}
