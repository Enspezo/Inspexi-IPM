import { describe, it, expect } from 'vitest';
import { Role } from '@/types';
import type { FeatureKey } from '@/lib/features';
import { filterSections, mainSections, organisatieSections } from './sidebar';

// Effectieve set van een Basis-org (de 4 basisfeatures); dependency-closure voegt
// hier niets toe omdat de basisfeatures zelf de wortels zijn.
const BASIS: FeatureKey[] = [
  'BASIS_CRM',
  'BASIS_UITVOERING',
  'BASIS_INSPECTIES',
  'BASIS_WORKFLOW',
];

const hasFrom = (keys: FeatureKey[]) => (key: FeatureKey) => keys.includes(key);
const hasAll = () => true; // Compleet-org / SUPERUSER

const orgAdmin = { roles: [Role.ORG_ADMIN] };

function itemLabels(sections: ReturnType<typeof filterSections>) {
  return sections.flatMap((s) => s.items).map((i) => i.label);
}

function childLabels(
  sections: ReturnType<typeof filterSections>,
  parentLabel: string,
) {
  const item = sections.flatMap((s) => s.items).find((i) => i.label === parentLabel);
  return item?.children?.map((c) => c.label) ?? [];
}

describe('sidebar filterSections — SaaS-feature-gating', () => {
  describe('Basis-org (ORG_ADMIN)', () => {
    const main = filterSections(mainSections, orgAdmin, hasFrom(BASIS));
    const org = filterSections(organisatieSections, orgAdmin, hasFrom(BASIS));

    it('verbergt Compleet-only items in het hoofdmenu', () => {
      const labels = itemLabels(main);
      expect(labels).not.toContain('Aanvragen'); // CRM_COMPLEET
      expect(labels).not.toContain('Offertes'); // CRM_COMPLEET
      expect(labels).not.toContain('Documenten'); // WORKFLOW_COMPLEET
      expect(labels).not.toContain('Planning'); // UITVOERING_COMPLEET
    });

    it('toont de basis-items wél', () => {
      const labels = itemLabels(main);
      expect(labels).toContain('Relaties'); // BASIS_CRM
      expect(labels).toContain('Projecten'); // BASIS_UITVOERING
      expect(labels).toContain('Inspecties'); // BASIS_INSPECTIES
      expect(labels).toContain('Assets'); // BASIS_INSPECTIES
    });

    it('verbergt de Klantgroepen-child (CRM_COMPLEET) maar houdt Relaties', () => {
      const children = childLabels(main, 'Relaties');
      expect(children).toContain('Overzicht');
      expect(children).toContain('Contactpersonen');
      expect(children).toContain('Locaties');
      expect(children).not.toContain('Klantgroepen');
    });

    it('verbergt Producten in het organisatie-submenu', () => {
      expect(itemLabels(org)).not.toContain('Producten'); // CRM_COMPLEET
    });

    it('houdt Templates zichtbaar voor de core E-mailsjablonen, zonder Offertesjablonen', () => {
      expect(itemLabels(org)).toContain('Templates');
      const children = childLabels(org, 'Templates');
      expect(children).toContain('E-mailsjablonen'); // core
      expect(children).not.toContain('Offertesjablonen'); // CRM_COMPLEET
    });

    it('toont Inspectie-config (BASIS_INSPECTIES) volledig', () => {
      expect(itemLabels(org)).toContain('Inspectie-config');
      expect(childLabels(org, 'Inspectie-config')).toContain('Checklists');
    });
  });

  describe('Compleet-org (ORG_ADMIN)', () => {
    const main = filterSections(mainSections, orgAdmin, hasAll);

    it('toont alle Compleet-items', () => {
      const labels = itemLabels(main);
      expect(labels).toContain('Aanvragen');
      expect(labels).toContain('Offertes');
      expect(labels).toContain('Documenten');
      expect(labels).toContain('Planning');
    });

    it('toont de Klantgroepen-child', () => {
      expect(childLabels(main, 'Relaties')).toContain('Klantgroepen');
    });
  });

  describe('SUPERUSER ziet altijd alles', () => {
    const su = { roles: [Role.SUPERUSER] };
    const org = filterSections(organisatieSections, su, hasAll);

    it('toont de platform-only items (roles-filter, geen feature-gate)', () => {
      const labels = itemLabels(org);
      expect(labels).toContain('Inspectie-systeem');
      expect(labels).toContain('Organisaties');
      expect(labels).toContain('Foutmeldingen');
    });
  });

  it('verbergt niets extra wanneer een rol-loos item geen feature heeft (Profiel)', () => {
    const main = filterSections(mainSections, orgAdmin, hasFrom(BASIS));
    expect(itemLabels(main)).toContain('Profiel');
  });
});
