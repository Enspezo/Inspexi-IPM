// Gedeelde primitieven uit @inspexi/ui: Button, Card, Input, Select, Checkbox, Modal,
// Tabs (+TabDef), Spinner, ErrorBox, InfoField, ConfirmProvider/useConfirm (+ConfirmOptions),
// ToastProvider/useToast, SignatureCanvas, ErrorBoundary.
export * from '@inspexi/ui';

// App-specifieke componenten (blijven lokaal — koppelen aan portal-lib of zijn portal-only):
export { ActionMenu, DropdownMenu, type ActionMenuItem, type DropdownMenuProps } from './action-menu';
export { StatusBadge } from './status-badge';
export { TagPill, readableTextColor } from './tag-pill';
export { TagSelect } from './tag-select';
export { ColorPicker } from './color-picker';
export { LookupBadge } from './lookup-badge';
export {
  Accordion,
  AccordionSection,
  type AccordionProps,
  type AccordionSectionProps,
} from './accordion';
export { Badge } from './badge';
export { Table, type Column, type TableSort } from './table';
export { SortableList, DragHandle, type SortableRenderProps } from './sortable-list';
export { RichTextEditor } from './rich-text-editor';
export { RichTextViewer } from './rich-text-viewer';
export { SignatureEditor } from './signature-editor';
export { AddressSearchInput, type AddressSearchInputProps } from './address-search-input';
export { KvkSearchInput, type KvkSearchInputProps } from './kvk-search-input';
export { VatInput, type VatInputProps } from './vat-input';
