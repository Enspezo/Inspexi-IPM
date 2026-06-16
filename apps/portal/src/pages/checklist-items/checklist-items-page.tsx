// Bibliotheekpagina checklist-items: herbruikbare vragen + categorie-beheer.
// Twee tabs: Items (CRUD + zoeken/filter) en Categorieën (gedeelde taxonomie).

import { useState } from 'react';
import { Tabs, type TabDef } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import { useAuth } from '@/providers/auth-provider';
import { Role } from '@/types';
import { ItemsTab } from './components/items-tab';
import { CategoriesTab } from './components/categories-tab';

type Tab = 'items' | 'categorieen';

const MANAGE_ROLES: Role[] = [Role.SUPERUSER, Role.ORG_ADMIN];

export default function ChecklistItemsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('items');

  const canManage = !!user && user.roles.some((r) => MANAGE_ROLES.includes(r));
  const isSuperuser = !!user && user.roles.includes(Role.SUPERUSER);

  const tabs: TabDef<Tab>[] = [
    { key: 'items', label: 'Items' },
    { key: 'categorieen', label: 'Categorieën' },
  ];

  return (
    <DetailPageLayout>
      <div className="space-y-6">
        <PageHeader
          title="Checklist-items"
          description="Herbruikbare inspectievragen en hun categorieën beheren"
        />

        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

        {activeTab === 'items' && <ItemsTab canManage={canManage} isSuperuser={isSuperuser} />}
        {activeTab === 'categorieen' && (
          <CategoriesTab canManage={canManage} isSuperuser={isSuperuser} />
        )}
      </div>
    </DetailPageLayout>
  );
}
