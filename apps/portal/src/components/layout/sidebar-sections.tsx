/**
 * Reusable sidebar section components for detail pages.
 *
 * NotesSidebarSection  — self-contained: fetches notes count, renders the
 *                        SidebarSection wrapper + NotesSection composer/list.
 * HistorySidebarSection — standardised "Historie" wrapper around AuditHistory.
 *
 * Usage:
 *   <NotesSidebarSection entityType={NoteEntityType.REQUEST} entityId={id!} />
 *   <HistorySidebarSection entityType="Request" entityId={id} />
 */
import { NoteEntityType } from '@/types';
import type { DocumentEntityType } from '@/types';
import { useEntityNotes } from '@/pages/notes/hooks/use-notes';
import { useEntityDocuments } from '@/pages/documents/hooks/use-documents';
import { NotesSection } from '@/components/notes/notes-section';
import { DocumentsSection } from '@/components/documents/documents-section';
import { AuditHistory } from '@/components/audit-history/audit-history';
import { SidebarSection } from './detail-page-layout';

// ─── Icons ───────────────────────────────────────────────────────────────────

function NotesIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
      />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

// ─── NotesSidebarSection ─────────────────────────────────────────────────────

interface NotesSidebarSectionProps {
  entityType: NoteEntityType;
  entityId: string;
}

export function NotesSidebarSection({ entityType, entityId }: NotesSidebarSectionProps) {
  const { data: notes = [] } = useEntityNotes(entityType, entityId);
  const count = notes.reduce(
    (acc, n) => acc + 1 + (n.replies?.filter((r) => !r.isDeleted).length ?? 0),
    0,
  );

  return (
    <SidebarSection icon={<NotesIcon />} label="Notities" count={count}>
      <NotesSection entityType={entityType} entityId={entityId} />
    </SidebarSection>
  );
}

// ─── DocumentsSidebarSection ─────────────────────────────────────────────────

function DocumentsIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
      />
    </svg>
  );
}

interface DocumentsSidebarSectionProps {
  entityType: DocumentEntityType;
  entityId: string;
  canUpload?: boolean;
  showSharedWithClient?: boolean;
}

export function DocumentsSidebarSection({
  entityType,
  entityId,
  canUpload = false,
  showSharedWithClient = false,
}: DocumentsSidebarSectionProps) {
  const { data } = useEntityDocuments(entityType, entityId);
  const count = data?.data?.length ?? 0;

  return (
    <SidebarSection icon={<DocumentsIcon />} label="Documenten" count={count}>
      <DocumentsSection
        entityType={entityType}
        entityId={entityId}
        canUpload={canUpload}
        showSharedWithClient={showSharedWithClient}
      />
    </SidebarSection>
  );
}

// ─── HistorySidebarSection ───────────────────────────────────────────────────

interface HistorySidebarSectionProps {
  entityType: string;
  entityId: string | undefined;
}

export function HistorySidebarSection({ entityType, entityId }: HistorySidebarSectionProps) {
  return (
    <SidebarSection icon={<HistoryIcon />} label="Historie">
      <AuditHistory entityType={entityType} entityId={entityId} />
    </SidebarSection>
  );
}
