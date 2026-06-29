// Selector voor een ouder-node, getoond als ingesprongen platte lijst van de boom.
// Bij verplaatsen sluiten we de node zelf + zijn nakomelingen uit (geen cykels).
import { Select } from '@/components/ui';
import { flattenTree, validMoveTargets, indentLabel, type TreeNode } from './tree-utils';

interface ParentSelectProps {
  label?: string;
  nodes: TreeNode[];
  value: string;
  onChange: (id: string) => void;
  /** Node die verplaatst wordt — die + nakomelingen vallen weg als doel. */
  excludeNode?: TreeNode;
  disabled?: boolean;
}

export function ParentSelect({
  label = 'Bovenliggende node',
  nodes,
  value,
  onChange,
  excludeNode,
  disabled,
}: ParentSelectProps) {
  const targets = excludeNode ? validMoveTargets(nodes, excludeNode) : flattenTree(nodes);
  const options = targets.map((n) => ({ value: n.id, label: indentLabel(n) }));

  return (
    <Select
      label={label}
      disabled={disabled}
      placeholder="— Kies bovenliggende node —"
      options={options}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
