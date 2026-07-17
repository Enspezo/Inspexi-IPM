// PM-resolutie (PRD-14 §14.3 besluit 7): pure fallback-keten
// Project.projectManagerId → plan.reviewerId → plan.assignedTo → null.
import { resolveProjectManager } from './resolve-project-manager';

describe('resolveProjectManager', () => {
  it('kiest de projectmanager van het gekoppelde project boven alles', () => {
    expect(
      resolveProjectManager({
        project: { projectManagerId: 'pm-1' },
        reviewerId: 'rev-1',
        assignedTo: 'insp-1',
      }),
    ).toBe('pm-1');
  });

  it('valt zonder project terug op de reviewer', () => {
    expect(
      resolveProjectManager({ project: null, reviewerId: 'rev-1', assignedTo: 'insp-1' }),
    ).toBe('rev-1');
  });

  it('valt zonder project én reviewer terug op de toegewezen inspecteur', () => {
    expect(
      resolveProjectManager({ project: null, reviewerId: null, assignedTo: 'insp-1' }),
    ).toBe('insp-1');
  });

  it('geeft null wanneer geen van de drie kandidaten bestaat', () => {
    expect(resolveProjectManager({ project: null, reviewerId: null, assignedTo: null })).toBeNull();
    // project is optioneel in het input-type; ontbreken telt als geen PM.
    expect(resolveProjectManager({ reviewerId: null, assignedTo: null })).toBeNull();
  });

  it('valt met een project zonder projectManagerId terug op de reviewer', () => {
    expect(
      resolveProjectManager({
        project: { projectManagerId: null },
        reviewerId: 'rev-1',
        assignedTo: 'insp-1',
      }),
    ).toBe('rev-1');
  });
});
