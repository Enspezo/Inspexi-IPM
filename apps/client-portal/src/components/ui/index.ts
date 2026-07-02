// Gecureerde barrel — gespiegeld op de Beheer-portal ui-componenten (zelfde API), maar alleen
// wat het klantportaal nodig heeft. Gedeelde primitieven komen uit @inspexi/ui: Button, Input,
// Select, Checkbox, Card, Modal, Spinner, Tabs (+TabDef), InfoField, ErrorBox, SignatureCanvas,
// ToastProvider/useToast, ConfirmProvider/useConfirm (+ConfirmOptions), ErrorBoundary.
export * from '@inspexi/ui';

// Klantportaal-specifieke componenten (blijven lokaal):
export { StatusBadge } from './status-badge';
export { LookupBadge } from './lookup-badge';
export { PhotoUploader } from './photo-uploader';
export { ImageLightbox } from './image-lightbox';
