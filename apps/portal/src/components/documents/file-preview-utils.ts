// Lichte helpers rond bestandspreview — bewust GEEN docx-preview/xlsx imports,
// zodat callers die alleen een label/typecheck nodig hebben niet de zware
// preview-bundel meetrekken. De echte renderer (FilePreviewModal) laadt lazy.

export const WORD_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
];

export const EXCEL_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
];

export function getMimeLabel(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType === 'image/jpeg') return 'JPEG afbeelding';
  if (mimeType === 'image/png') return 'PNG afbeelding';
  if (mimeType === 'image/svg+xml') return 'SVG afbeelding';
  if (mimeType === 'image/webp') return 'WebP afbeelding';
  if (mimeType === 'application/msword') return 'Word document (.doc)';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    return 'Word document (.docx)';
  if (mimeType === 'application/vnd.ms-excel') return 'Excel spreadsheet (.xls)';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    return 'Excel spreadsheet (.xlsx)';
  if (mimeType === 'application/vnd.ms-powerpoint') return 'PowerPoint presentatie (.ppt)';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    return 'PowerPoint presentatie (.pptx)';
  if (mimeType === 'text/csv') return 'CSV bestand';
  if (mimeType === 'application/zip') return 'ZIP archief';
  return mimeType;
}

export function isPreviewable(mimeType: string): boolean {
  return (
    mimeType === 'application/pdf' ||
    mimeType.startsWith('image/') ||
    mimeType === 'text/csv' ||
    WORD_MIME_TYPES.includes(mimeType) ||
    EXCEL_MIME_TYPES.includes(mimeType)
  );
}
