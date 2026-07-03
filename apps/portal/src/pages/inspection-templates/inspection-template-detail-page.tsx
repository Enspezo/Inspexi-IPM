// Detailpagina inspectie-template — host voor de document-builder (Fase 5d).
// Beheer detail-patroon: DetailPageLayout + AuditHistory + tabs.

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, ErrorBox, InfoField, Spinner, StatusBadge, Tabs, type TabDef } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { AuditHistory } from '@/components/audit-history/audit-history';
import { useAuth } from '@/providers/auth-provider';
import { formatDate } from '@/lib/format';
import { TEMPLATE_STATUS } from '@/lib/status';
import { Role, TemplateStatus } from '@/types';
import { useInspectionTemplate } from './hooks/use-inspection-templates';
import { DocumentBuilderTab } from './components/document-builder-tab';
import { ForkInspectionTemplateModal } from './components/fork-inspection-template-modal';

type Tab = 'overzicht' | 'document-builder';

const MANAGE_ROLES: Role[] = [Role.SUPERUSER, Role.ORG_ADMIN];

export default function InspectionTemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: template, isLoading, error } = useInspectionTemplate(id!);
  const [activeTab, setActiveTab] = useState<Tab>('overzicht');
  const [forkOpen, setForkOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !template) {
    return <ErrorBox>Inspectie-template niet gevonden</ErrorBox>;
  }

  const isManagerRole = !!user && user.roles.some((r) => MANAGE_ROLES.includes(r));
  const isSuperuser = !!user && user.roles.includes(Role.SUPERUSER);
  const isConcept = template.status === TemplateStatus.CONCEPT;
  const systemOk = template.isSystem ? isSuperuser : true;
  const canManage = isManagerRole && isConcept && systemOk;
  // Forken kan alleen een org-gebruiker (heeft orgId) op een systeemtemplate.
  const canFork = isManagerRole && template.isSystem && !!user?.orgId;

  const tabs: TabDef<Tab>[] = [
    { key: 'overzicht', label: 'Overzicht' },
    { key: 'document-builder', label: 'Document-builder' },
  ];

  return (
    <DetailPageLayout sidebar={<AuditHistory entityType="InspectionTemplate" entityId={id} />}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/inspection-templates')}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Terug naar overzicht"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900">{template.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusBadge status={template.status} map={TEMPLATE_STATUS} />
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                {template.code}
              </span>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                v{template.version}
              </span>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                {template.isSystem ? 'Systeem' : 'Eigen'}
              </span>
            </div>
          </div>
          {canFork && (
            <Button onClick={() => setForkOpen(true)}>Forken naar mijn organisatie</Button>
          )}
        </div>

        {/* Tabs */}
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

        {/* Tab-inhoud */}
        {activeTab === 'overzicht' && (
          <Card title="Templategegevens">
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoField label="Naam" value={template.name} />
              <InfoField label="Code" value={template.code} />
              <InfoField label="Normtype" value={template.normTypeCode} />
              <InfoField label="Versie" value={template.version} />
              <InfoField label="Classificatiemodel" value={template.classificationModel?.name} />
              <InfoField label="Herkomst" value={template.isSystem ? 'Systeem' : 'Eigen'} />
              <InfoField label="Aangemaakt" value={formatDate(template.createdAt)} />
              <InfoField label="Bijgewerkt" value={formatDate(template.updatedAt)} />
              <div className="sm:col-span-2">
                <InfoField label="Beschrijving" value={template.description} />
              </div>
            </dl>
          </Card>
        )}

        {activeTab === 'document-builder' && (
          <DocumentBuilderTab inspectionTemplateId={id!} canManage={canManage} />
        )}
      </div>

      {canFork && (
        <ForkInspectionTemplateModal
          isOpen={forkOpen}
          onClose={() => setForkOpen(false)}
          source={template}
        />
      )}
    </DetailPageLayout>
  );
}
