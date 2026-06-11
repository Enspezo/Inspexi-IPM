import type { MutableRefObject } from 'react';
import type { Editor } from '@tiptap/react';
import { Input, Select } from '@/components/ui';
import { BlockEditor } from '@/components/block-editor/block-editor';
import type { ContentBlock } from '@/types';

// ── BLOCKS: Inhoud tab ─────────────────────────────────

export function ContentTab({
  name,
  setName,
  description,
  setDescription,
  defaultValidityDays,
  setDefaultValidityDays,
  requiresApproval,
  setRequiresApproval,
  handleFieldChange,
  blocks,
  handleBlocksChange,
  templateId,
  activeEditorRef,
}: {
  name: string;
  setName: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  defaultValidityDays: number;
  setDefaultValidityDays: (value: number) => void;
  requiresApproval: string;
  setRequiresApproval: (value: string) => void;
  handleFieldChange: () => void;
  blocks: ContentBlock[];
  handleBlocksChange: (newBlocks: ContentBlock[]) => void;
  templateId: string;
  activeEditorRef: MutableRefObject<Editor | null>;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input
          label="Naam"
          value={name}
          onChange={(e) => { setName(e.target.value); handleFieldChange(); }}
          placeholder="Template naam"
        />
        <Input
          label="Beschrijving"
          value={description}
          onChange={(e) => { setDescription(e.target.value); handleFieldChange(); }}
          placeholder="Korte beschrijving van dit template"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input
          label="Geldigheidsdagen"
          type="number"
          min={1}
          value={defaultValidityDays}
          onChange={(e) => { setDefaultValidityDays(Number(e.target.value) || 30); handleFieldChange(); }}
        />
        <Select
          label="Goedkeuring vereist"
          value={requiresApproval}
          options={[
            { value: 'false', label: 'Nee' },
            { value: 'true', label: 'Ja' },
          ]}
          onChange={(e) => { setRequiresApproval(e.target.value); handleFieldChange(); }}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Inhoud</label>
        <BlockEditor
          blocks={blocks}
          onChange={handleBlocksChange}
          templateId={templateId}
          activeEditorRef={activeEditorRef}
        />
      </div>
    </div>
  );
}
