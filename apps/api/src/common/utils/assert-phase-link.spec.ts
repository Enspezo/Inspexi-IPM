import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { resolvePhaseLink } from './assert-phase-link';

describe('resolvePhaseLink (PRD-12 §12.4.2)', () => {
  const phaseModel = { findUnique: jest.fn() };
  beforeEach(() => jest.clearAllMocks());

  const mockPhase = (over: Partial<{ orgId: string; projectId: string; isDeleted: boolean }> = {}) => ({
    orgId: 'org-1',
    projectId: 'project-1',
    isDeleted: false,
    ...over,
  });

  it('returns undefined when projectPhaseId is undefined (field untouched)', async () => {
    const result = await resolvePhaseLink(phaseModel, undefined, 'org-1', 'project-1');
    expect(result).toBeUndefined();
    expect(phaseModel.findUnique).not.toHaveBeenCalled();
  });

  it('returns { phaseId: null } when unlinking with null', async () => {
    const result = await resolvePhaseLink(phaseModel, null, 'org-1', 'project-1');
    expect(result).toEqual({ phaseId: null });
    expect(phaseModel.findUnique).not.toHaveBeenCalled();
  });

  it('throws NotFound when the phase does not exist', async () => {
    phaseModel.findUnique.mockResolvedValue(null);
    await expect(
      resolvePhaseLink(phaseModel, 'phase-1', 'org-1', 'project-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFound when the phase is soft-deleted', async () => {
    phaseModel.findUnique.mockResolvedValue(mockPhase({ isDeleted: true }));
    await expect(
      resolvePhaseLink(phaseModel, 'phase-1', 'org-1', 'project-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws Forbidden (403) on a cross-tenant phase before the project check', async () => {
    phaseModel.findUnique.mockResolvedValue(mockPhase({ orgId: 'org-2', projectId: 'project-2' }));
    // entity in another project too — org check must win → 403, not 400.
    await expect(
      resolvePhaseLink(phaseModel, 'phase-1', 'org-1', 'project-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws BadRequest (400) when the phase belongs to a different project of the same org', async () => {
    phaseModel.findUnique.mockResolvedValue(mockPhase({ projectId: 'project-2' }));
    await expect(
      resolvePhaseLink(phaseModel, 'phase-1', 'org-1', 'project-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('links and cascades the phase project when the entity has none', async () => {
    phaseModel.findUnique.mockResolvedValue(mockPhase());
    const result = await resolvePhaseLink(phaseModel, 'phase-1', 'org-1', null);
    expect(result).toEqual({ phaseId: 'phase-1', projectId: 'project-1' });
  });

  it('links when the entity project already matches the phase project', async () => {
    phaseModel.findUnique.mockResolvedValue(mockPhase());
    const result = await resolvePhaseLink(phaseModel, 'phase-1', 'org-1', 'project-1');
    expect(result).toEqual({ phaseId: 'phase-1', projectId: 'project-1' });
  });

  it('skips the project-consistency check when the entity has no project column (WorkOrder)', async () => {
    phaseModel.findUnique.mockResolvedValue(mockPhase({ projectId: 'project-2' }));
    // entityProjectId undefined → only org + existence validated.
    const result = await resolvePhaseLink(phaseModel, 'phase-1', 'org-1', undefined);
    expect(result).toEqual({ phaseId: 'phase-1', projectId: 'project-2' });
  });

  it('bypasses the org check for SUPERUSER (orgId null)', async () => {
    phaseModel.findUnique.mockResolvedValue(mockPhase({ orgId: 'org-9' }));
    const result = await resolvePhaseLink(phaseModel, 'phase-1', null, null);
    expect(result).toEqual({ phaseId: 'phase-1', projectId: 'project-1' });
  });
});
