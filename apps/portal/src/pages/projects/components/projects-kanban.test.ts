import { describe, it, expect } from 'vitest';
import { ProjectStatus } from '@/types';
import type { Project } from '@/types';
import { groupProjectsByStatus, filterByManagers } from './projects-kanban';

function mkProject(partial: Partial<Project>): Project {
  return {
    id: 'p1',
    projectNumber: 'PRJ-001',
    title: 'Test',
    status: ProjectStatus.ACTIEF,
    ...partial,
  } as unknown as Project;
}

describe('groupProjectsByStatus', () => {
  it('groups projects into all four status columns', () => {
    const projects = [
      mkProject({ id: 'a', status: ProjectStatus.ACTIEF }),
      mkProject({ id: 'b', status: ProjectStatus.ON_HOLD }),
      mkProject({ id: 'c', status: ProjectStatus.ACTIEF }),
      mkProject({ id: 'd', status: ProjectStatus.AFGEROND }),
    ];

    const grouped = groupProjectsByStatus(projects, {});

    expect(Object.keys(grouped)).toEqual([
      ProjectStatus.ACTIEF,
      ProjectStatus.ON_HOLD,
      ProjectStatus.AFGEROND,
      ProjectStatus.GEANNULEERD,
    ]);
    expect(grouped[ProjectStatus.ACTIEF].map((p) => p.id)).toEqual(['a', 'c']);
    expect(grouped[ProjectStatus.ON_HOLD].map((p) => p.id)).toEqual(['b']);
    expect(grouped[ProjectStatus.AFGEROND].map((p) => p.id)).toEqual(['d']);
    expect(grouped[ProjectStatus.GEANNULEERD]).toEqual([]);
  });

  it('places a project in its optimistic override column, not its server column', () => {
    const projects = [mkProject({ id: 'a', status: ProjectStatus.ACTIEF })];

    const grouped = groupProjectsByStatus(projects, { a: ProjectStatus.AFGEROND });

    expect(grouped[ProjectStatus.ACTIEF]).toEqual([]);
    expect(grouped[ProjectStatus.AFGEROND].map((p) => p.id)).toEqual(['a']);
  });

  it('does not mutate the source projects when applying an override', () => {
    const project = mkProject({ id: 'a', status: ProjectStatus.ACTIEF });

    groupProjectsByStatus([project], { a: ProjectStatus.ON_HOLD });

    expect(project.status).toBe(ProjectStatus.ACTIEF);
  });
});

describe('filterByManagers', () => {
  const projects = [
    mkProject({ id: 'a', projectManager: { id: 'm1' } as Project['projectManager'] }),
    mkProject({ id: 'b', projectManager: { id: 'm2' } as Project['projectManager'] }),
    mkProject({ id: 'c', projectManager: undefined }),
  ];

  it('returns every project when no manager is selected', () => {
    expect(filterByManagers(projects, []).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps only projects of the selected managers', () => {
    expect(filterByManagers(projects, ['m1']).map((p) => p.id)).toEqual(['a']);
    expect(filterByManagers(projects, ['m1', 'm2']).map((p) => p.id)).toEqual(['a', 'b']);
  });
});
