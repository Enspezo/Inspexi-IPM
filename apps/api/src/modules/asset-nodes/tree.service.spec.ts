import { BadRequestException } from '@nestjs/common';
import { AssetNodeType, User } from '@prisma/client';
import { TreeService } from './tree.service';

describe('TreeService', () => {
  let tree: TreeService;
  let assetTypes: { validateParentConstraint: jest.Mock };
  let locationTypes: { validateParentConstraint: jest.Mock };
  const user = { id: 'u1', orgId: 'org1' } as User;

  beforeEach(() => {
    assetTypes = { validateParentConstraint: jest.fn().mockResolvedValue({ valid: true }) };
    locationTypes = { validateParentConstraint: jest.fn().mockResolvedValue({ valid: true }) };
    tree = new TreeService(assetTypes as never, locationTypes as never);
  });

  describe('path helpers', () => {
    it('rootLabel returns the first ltree label', () => {
      expect(tree.rootLabel('aaa.bbb.ccc')).toBe('aaa');
      expect(tree.rootLabel('solo')).toBe('solo');
    });

    it('isSelfOrDescendant matches self and descendants but not siblings/ancestors', () => {
      expect(tree.isSelfOrDescendant('a.b', 'a.b')).toBe(true); // self
      expect(tree.isSelfOrDescendant('a.b.c', 'a.b')).toBe(true); // descendant
      expect(tree.isSelfOrDescendant('a.b', 'a.b.c')).toBe(false); // ancestor
      expect(tree.isSelfOrDescendant('a.bb', 'a.b')).toBe(false); // label-prefix, not descendant
      expect(tree.isSelfOrDescendant('a.x', 'a.b')).toBe(false); // sibling
    });

    it('sameTree compares the root label', () => {
      expect(tree.sameTree('root1.a.b', 'root1.c')).toBe(true);
      expect(tree.sameTree('root1.a', 'root2.a')).toBe(false);
    });
  });

  describe('assertParentTypeAllowed (invariants 1, 3, 4)', () => {
    it('root (null parent) must be a LOCATION', () => {
      expect(() => tree.assertParentTypeAllowed(AssetNodeType.LOCATION, null)).not.toThrow();
      expect(() => tree.assertParentTypeAllowed(AssetNodeType.ASSET, null)).toThrow(
        BadRequestException,
      );
    });

    it('LOCATION may only sit under a LOCATION', () => {
      expect(() =>
        tree.assertParentTypeAllowed(AssetNodeType.LOCATION, AssetNodeType.LOCATION),
      ).not.toThrow();
      expect(() =>
        tree.assertParentTypeAllowed(AssetNodeType.LOCATION, AssetNodeType.ASSET),
      ).toThrow(BadRequestException);
    });

    it('ASSET may sit under a LOCATION or an ASSET', () => {
      expect(() =>
        tree.assertParentTypeAllowed(AssetNodeType.ASSET, AssetNodeType.LOCATION),
      ).not.toThrow();
      expect(() =>
        tree.assertParentTypeAllowed(AssetNodeType.ASSET, AssetNodeType.ASSET),
      ).not.toThrow();
    });
  });

  describe('validateTypeConstraint (invariant 5)', () => {
    it('delegates ASSET→ASSET to AssetTypesService', async () => {
      await tree.validateTypeConstraint(
        { nodeType: AssetNodeType.ASSET, typeCode: 'groep' },
        { nodeType: AssetNodeType.ASSET, typeCode: 'verdeler' },
        user,
      );
      expect(assetTypes.validateParentConstraint).toHaveBeenCalledWith('groep', 'verdeler', user);
      expect(locationTypes.validateParentConstraint).not.toHaveBeenCalled();
    });

    it('throws when the asset constraint is violated', async () => {
      assetTypes.validateParentConstraint.mockResolvedValue({ valid: false, message: 'nope' });
      await expect(
        tree.validateTypeConstraint(
          { nodeType: AssetNodeType.ASSET, typeCode: 'groep' },
          { nodeType: AssetNodeType.ASSET, typeCode: 'wcd' },
          user,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('delegates LOCATION→LOCATION to LocationTypesService', async () => {
      await tree.validateTypeConstraint(
        { nodeType: AssetNodeType.LOCATION, typeCode: 'ruimte' },
        { nodeType: AssetNodeType.LOCATION, typeCode: 'verdieping' },
        user,
      );
      expect(locationTypes.validateParentConstraint).toHaveBeenCalledWith(
        'ruimte',
        'verdieping',
        user,
      );
      expect(assetTypes.validateParentConstraint).not.toHaveBeenCalled();
    });

    it('LOCATION→ASSET (first asset under a location) is always allowed — no constraint check', async () => {
      await tree.validateTypeConstraint(
        { nodeType: AssetNodeType.ASSET, typeCode: 'verdeler' },
        { nodeType: AssetNodeType.LOCATION, typeCode: 'ruimte' },
        user,
      );
      expect(assetTypes.validateParentConstraint).not.toHaveBeenCalled();
      expect(locationTypes.validateParentConstraint).not.toHaveBeenCalled();
    });

    it('root (null parent) needs no constraint check', async () => {
      await tree.validateTypeConstraint(
        { nodeType: AssetNodeType.LOCATION, typeCode: 'gebouw' },
        null,
        user,
      );
      expect(assetTypes.validateParentConstraint).not.toHaveBeenCalled();
      expect(locationTypes.validateParentConstraint).not.toHaveBeenCalled();
    });
  });
});
