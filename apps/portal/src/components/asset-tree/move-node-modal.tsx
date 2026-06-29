// Verplaats-modal: kies een nieuwe bovenliggende node (binnen dezelfde boom).
// De node zelf + zijn nakomelingen zijn uitgesloten als doel.
import { useEffect, useState } from 'react';
import { Modal, Button, ErrorBox, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { useMoveAssetNode } from '@/pages/inspections/hooks/use-asset-nodes';
import { ParentSelect } from './parent-select';
import type { TreeNode } from './tree-utils';

interface MoveNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  node: TreeNode | null;
  nodes: TreeNode[];
  onMoved?: () => void;
}

export function MoveNodeModal({ isOpen, onClose, node, nodes, onMoved }: MoveNodeModalProps) {
  const { showToast } = useToast();
  const moveMutation = useMoveAssetNode();
  const [newParentId, setNewParentId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNewParentId(node?.parentId ?? '');
      setError(null);
    }
  }, [isOpen, node]);

  if (!node) return null;

  const handleMove = async () => {
    setError(null);
    try {
      await moveMutation.mutateAsync({ id: node.id, newParentId });
      showToast('Node verplaatst', 'success');
      onMoved?.();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Verplaatsen mislukt'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`"${node.name}" verplaatsen`}>
      <div className="space-y-4">
        {error && <ErrorBox>{error}</ErrorBox>}
        <ParentSelect
          label="Nieuwe bovenliggende node"
          nodes={nodes}
          value={newParentId}
          onChange={setNewParentId}
          excludeNode={node}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button
            onClick={handleMove}
            disabled={!newParentId || newParentId === node.parentId}
            isLoading={moveMutation.isPending}
          >
            Verplaatsen
          </Button>
        </div>
      </div>
    </Modal>
  );
}
