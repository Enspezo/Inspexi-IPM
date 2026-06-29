// Org-breed locatie- & assetoverzicht. Spiegelt de inspectie-objectboom van de
// CRM-locatiedetailpagina: je kiest een CRM-locatie (object/site) en ziet daarvan de
// volledige Locatie+Asset-boom via de gedeelde <TreeExplorer>. Assets zijn persistent
// en plan-ontkoppeld; de boom hangt per CRM-locatie (zie docs/PLAN-ASSET-NODE-TREE.md).

import { useState, useEffect, useMemo } from 'react';
import { Card, Input, Spinner, ErrorBox } from '@/components/ui';
import { PageHeader } from '@/components/layout/page-header';
import { useAuth } from '@/providers/auth-provider';
import { CRM_ROLES } from '@/lib/roles';
import { useLocations } from '@/pages/contacts/hooks/use-locations';
import { useAssetTree } from '@/pages/inspections/hooks/use-asset-nodes';
import { TreeExplorer } from '@/components/asset-tree';

export default function AssetsPage() {
  const { user } = useAuth();
  const userCanWrite = !!user && user.roles.some((r) => CRM_ROLES.includes(r));

  const [search, setSearch] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  const { data, isLoading, error } = useLocations({
    search: search || undefined,
    limit: 200,
    enabled: true,
  });
  const locations = useMemo(() => data?.data ?? [], [data]);

  // Auto-selecteer de eerste locatie zodra de lijst laadt en er nog niets gekozen is.
  useEffect(() => {
    if (!selectedLocationId && locations.length > 0) {
      setSelectedLocationId(locations[0].id);
    }
  }, [locations, selectedLocationId]);

  const selectedLocation = locations.find((l) => l.id === selectedLocationId) ?? null;
  const { data: treeData, isLoading: treeLoading } = useAssetTree(selectedLocationId ?? undefined);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assets"
        description="Locatie- en assetboom per object — kies een locatie om de boom te beheren"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        {/* Locatie-selector */}
        <Card className="self-start">
          <div className="space-y-3">
            <Input
              placeholder="Locatie zoeken op naam / adres..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {isLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : error ? (
              <ErrorBox>Fout bij het laden van locaties: {(error as Error).message}</ErrorBox>
            ) : locations.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">Geen locaties gevonden</p>
            ) : (
              <ul className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto">
                {locations.map((loc) => {
                  const isActive = loc.id === selectedLocationId;
                  const contact = (loc as { contact?: { companyName: string | null; firstName: string | null; lastName: string | null } }).contact;
                  const contactName =
                    contact?.companyName || [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') || null;
                  return (
                    <li key={loc.id}>
                      <button
                        onClick={() => setSelectedLocationId(loc.id)}
                        className={`w-full rounded-md px-3 py-2 text-left transition-colors ${
                          isActive ? 'bg-primary-50 text-primary-800' : 'hover:bg-gray-50'
                        }`}
                      >
                        <span className="block text-sm font-medium">{loc.name}</span>
                        <span className="block text-xs text-gray-500">
                          {loc.street} {loc.houseNumber}, {loc.postalCode} {loc.city}
                        </span>
                        {contactName ? (
                          <span className="block text-xs text-gray-400">{contactName}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>

        {/* Boom van de geselecteerde locatie */}
        <Card
          title={selectedLocation ? `Objectboom — ${selectedLocation.name}` : 'Objectboom'}
        >
          {!selectedLocationId ? (
            <p className="py-10 text-center text-sm text-gray-500">
              Kies links een locatie om de Locatie- en assetboom te bekijken.
            </p>
          ) : (
            <TreeExplorer
              nodes={treeData}
              isLoading={treeLoading}
              canWrite={userCanWrite}
              emptyMessage="Nog geen objecten op deze locatie."
            />
          )}
        </Card>
      </div>
    </div>
  );
}
