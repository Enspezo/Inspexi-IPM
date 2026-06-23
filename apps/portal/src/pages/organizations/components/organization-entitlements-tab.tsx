import { useEffect, useState } from 'react';
import { Button, Card, ErrorBox, Select, Spinner, useToast } from '@/components/ui';
import { overrideStateFor, type FeatureOverrideState } from '@/lib/entitlements';
import { usePlans, useFeatureCatalog } from '@/pages/plans/hooks/use-plans';
import {
  useOrganizationEntitlements,
  useAssignPlan,
  useSetOrganizationFeature,
} from '../hooks/use-organizations';

const STATE_OPTIONS: { value: FeatureOverrideState; label: string }[] = [
  { value: 'PLAN', label: 'Volg abonnement' },
  { value: 'ENABLED', label: 'Bijgeschakeld (aan)' },
  { value: 'DISABLED', label: 'Afgeschakeld (uit)' },
];

/**
 * SUPERUSER-beheer van de entitlements van één organisatie (PRD-09 §5.3): kies het
 * abonnement (plan-template) en zet per functie een override bovenop het plan. De
 * effectieve set en de dependency-waarschuwingen komen autoritatief van de server
 * (na elke schrijf direct ververst).
 */
export function OrganizationEntitlementsTab({ orgId }: { orgId: string }) {
  const { showToast } = useToast();
  const { data: ent, isLoading, error } = useOrganizationEntitlements(orgId);
  const { data: plans } = usePlans();
  const { data: catalog } = useFeatureCatalog();
  const assignPlan = useAssignPlan(orgId);
  const setFeature = useSetOrganizationFeature(orgId);

  const [pendingPlanId, setPendingPlanId] = useState('');
  useEffect(() => {
    if (ent) setPendingPlanId(ent.planId ?? '');
  }, [ent]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }
  if (error || !ent) {
    return <ErrorBox>{error?.message || 'Entitlements konden niet geladen worden'}</ErrorBox>;
  }

  const planChanged = pendingPlanId !== (ent.planId ?? '');
  const planOptions = [
    { value: '', label: 'Geen abonnement' },
    ...(plans ?? []).map((p) => ({
      value: p.id,
      label: p.isActive ? p.name : `${p.name} (inactief)`,
    })),
  ];
  const labelOf = (key: string) => catalog?.find((f) => f.key === key)?.label ?? key;
  const warningFor = (key: string) => ent.warnings.find((w) => w.featureKey === key);

  const onSavePlan = async () => {
    try {
      await assignPlan.mutateAsync(pendingPlanId || null);
      showToast('Abonnement bijgewerkt', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Opslaan mislukt', 'error');
    }
  };

  const onFeatureChange = async (featureKey: string, state: FeatureOverrideState) => {
    try {
      await setFeature.mutateAsync({ featureKey, state });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Wijzigen mislukt', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Abonnement-keuze */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900">Abonnement</h3>
        <p className="mt-1 text-sm text-gray-500">
          Het abonnement bepaalt de basis-set functies. Overrides hieronder schakelen
          functies bij of af bovenop dit abonnement.
        </p>
        <div className="mt-4 flex items-end gap-3">
          <div className="w-64">
            <Select
              label="Toegewezen abonnement"
              options={planOptions}
              value={pendingPlanId}
              onChange={(e) => setPendingPlanId(e.target.value)}
            />
          </div>
          <Button
            disabled={!planChanged}
            isLoading={assignPlan.isPending}
            onClick={onSavePlan}
          >
            Opslaan
          </Button>
        </div>
      </Card>

      {/* Dependency-waarschuwingen */}
      {ent.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h4 className="text-sm font-semibold text-amber-900">
            Let op: afschakeling genegeerd
          </h4>
          <ul className="mt-2 space-y-1 text-sm text-amber-800">
            {ent.warnings.map((w) => (
              <li key={w.featureKey}>
                <span className="font-medium">{labelOf(w.featureKey)}</span> is
                afgeschakeld, maar blijft actief omdat{' '}
                <span className="font-medium">
                  {w.requiredBy.map(labelOf).join(', ')}
                </span>{' '}
                ervan afhangt (afhankelijkheid wint).
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Per-functie overrides */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900">Functies</h3>
        <p className="mt-1 text-sm text-gray-500">
          Per functie: volg het abonnement, of schakel los bij/af. Een afgeschakelde
          functie waar een actieve functie van afhangt, blijft toch actief.
        </p>

        {!catalog ? (
          <div className="flex justify-center py-6">
            <Spinner size="sm" />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100">
            {catalog.map((feature) => {
              const inPlan = ent.planFeatureKeys.includes(feature.key);
              const isEffective = ent.effective.includes(feature.key);
              const state = overrideStateFor(feature.key, ent.overrides);
              const warning = warningFor(feature.key);
              const saving =
                setFeature.isPending &&
                setFeature.variables?.featureKey === feature.key;

              return (
                <li key={feature.key} className="flex items-center gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {feature.label}
                      </span>
                      {isEffective ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
                          Actief
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                          Inactief
                        </span>
                      )}
                      <span className="text-[11px] text-gray-400">
                        {inPlan ? 'in abonnement' : 'niet in abonnement'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">{feature.description}</p>
                    {warning && (
                      <p className="mt-1 text-[11px] text-amber-700">
                        Afschakeling genegeerd — vereist door{' '}
                        {warning.requiredBy.map(labelOf).join(', ')}.
                      </p>
                    )}
                  </div>
                  <div className="flex w-52 shrink-0 items-center gap-2">
                    <Select
                      options={STATE_OPTIONS}
                      value={state}
                      disabled={saving}
                      onChange={(e) =>
                        onFeatureChange(
                          feature.key,
                          e.target.value as FeatureOverrideState,
                        )
                      }
                    />
                    {saving && <Spinner size="sm" />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
