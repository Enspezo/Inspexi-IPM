import { orderAssetNodesParentFirst } from './sync.service';
import { EntityChangeDto } from './dto';

/** Mini-helper: bouwt een create-change met id + optionele parentId. */
function node(id: string, parentId?: string | null): EntityChangeDto {
  return { operation: 'create', data: { id, parentId: parentId ?? undefined } } as EntityChangeDto;
}

/** Volgorde van ids in de output, voor leesbare asserts. */
const ids = (cs: EntityChangeDto[]) => cs.map((c) => String(c.data.id ?? ''));

describe('orderAssetNodesParentFirst', () => {
  it('zet een ouder vóór het kind, ook als het kind eerst binnenkomt', () => {
    const out = orderAssetNodesParentFirst([node('child', 'root'), node('root', null)]);
    expect(ids(out)).toEqual(['root', 'child']);
  });

  it('ordent meerdere niveaus root-first (omgekeerde input)', () => {
    const out = orderAssetNodesParentFirst([
      node('grandchild', 'child'),
      node('child', 'root'),
      node('root', null),
    ]);
    expect(ids(out).indexOf('root')).toBeLessThan(ids(out).indexOf('child'));
    expect(ids(out).indexOf('child')).toBeLessThan(ids(out).indexOf('grandchild'));
  });

  it('laat een node met een parent buiten de batch (al in DB) ongemoeid', () => {
    const out = orderAssetNodesParentFirst([node('a', 'existing-db-id'), node('b', 'existing-db-id')]);
    expect(ids(out).sort()).toEqual(['a', 'b']);
    expect(out).toHaveLength(2);
  });

  it('breekt een cyclus zonder oneindige recursie en behoudt alle records', () => {
    const out = orderAssetNodesParentFirst([node('a', 'b'), node('b', 'a')]);
    expect(ids(out).sort()).toEqual(['a', 'b']);
  });

  it('behoudt id-loze records (processChange faalt er later netjes op)', () => {
    const out = orderAssetNodesParentFirst([
      { operation: 'create', data: { parentId: 'root' } } as EntityChangeDto,
      node('root', null),
    ]);
    expect(out).toHaveLength(2);
    expect(ids(out)).toContain('root');
  });

  it('dedupliceert niet en raakt elke node precies één keer', () => {
    const out = orderAssetNodesParentFirst([node('root', null), node('child', 'root')]);
    expect(out).toHaveLength(2);
    expect(ids(out)).toEqual(['root', 'child']);
  });
});
