import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useInspection } from './hooks/use-inspections';
import { Spinner, Tabs, ErrorBox, type TabDef } from '@/components/ui';
import { addressLine } from '@/lib/format';
import { normTypeLabel } from '@/lib/labels';
import { OverviewTab } from './components/overview-tab';
import { FindingsTab } from './components/findings-tab';
import { MessagesTab } from './components/messages-tab';
import { DocumentsTab } from './components/documents-tab';
import { TabErrorBoundary } from './components/tab-error-boundary';

export type InspectionTabKey = 'overview' | 'findings' | 'messages' | 'documents';

export default function InspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: inspection, isLoading, error } = useInspection(id);
  const [tab, setTab] = useState<InspectionTabKey>('overview');

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !inspection) {
    return (
      <div className="space-y-4">
        <ErrorBox>Kon de inspectie niet laden.</ErrorBox>
        <Link to="/inspections" className="text-sm font-medium text-primary-600 hover:underline">
          ← Terug naar inspecties
        </Link>
      </div>
    );
  }

  const tabs: TabDef<InspectionTabKey>[] = [
    { key: 'overview', label: 'Overzicht' },
    { key: 'findings', label: 'Constateringen', count: inspection.findingCounts.total },
    { key: 'messages', label: 'Berichten' },
    { key: 'documents', label: 'Documenten' },
  ];

  return (
    <div className="space-y-6">
      <Link to="/inspections" className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Terug naar inspecties
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {normTypeLabel(inspection.normTypeCode)} — {inspection.projectName}
        </h1>
        <p className="mt-1 text-sm text-gray-600">{addressLine(inspection)}</p>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {/* B-401: elke tab in een eigen boundary — één kapotte tab sloopt nooit de pagina. */}
      {tab === 'overview' && (
        <TabErrorBoundary>
          <OverviewTab inspection={inspection} onNavigateTab={setTab} />
        </TabErrorBoundary>
      )}
      {tab === 'findings' && (
        <TabErrorBoundary>
          <FindingsTab
            inspectionId={inspection.id}
            onlineRepairEnabled={inspection.onlineRepairEnabled}
          />
        </TabErrorBoundary>
      )}
      {tab === 'messages' && (
        <TabErrorBoundary>
          <MessagesTab inspectionId={inspection.id} />
        </TabErrorBoundary>
      )}
      {tab === 'documents' && (
        <TabErrorBoundary>
          <DocumentsTab inspectionId={inspection.id} inspectionName={inspection.projectName} />
        </TabErrorBoundary>
      )}
    </div>
  );
}
