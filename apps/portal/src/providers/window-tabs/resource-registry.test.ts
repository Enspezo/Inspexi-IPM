import { describe, it, expect } from 'vitest';
import {
  makeResource,
  findResourceByPath,
  RESOURCE_TABS_BY_TYPE,
} from './resource-registry';

describe('resource-registry — findResourceByPath (registered resources)', () => {
  it('resolves the list route to a list match', () => {
    const match = findResourceByPath('/requests');
    expect(match).toEqual({ kind: 'list', resource: RESOURCE_TABS_BY_TYPE.request });
  });

  it('resolves a detail route to its record id', () => {
    const match = findResourceByPath('/requests/abc-123');
    expect(match?.kind).toBe('detail');
    expect(match && match.kind === 'detail' && match.id).toBe('abc-123');
  });

  it('ignores nested routes (e.g. /:id/edit)', () => {
    expect(findResourceByPath('/requests/abc/edit')).toBeNull();
  });

  it('does not match on a non-boundary prefix', () => {
    expect(findResourceByPath('/requestsfoo')).toBeNull();
  });

  it('returns null for an unregistered route', () => {
    expect(findResourceByPath('/contacts/1')).toBeNull();
  });
});

describe('resource-registry — request entry round-trip', () => {
  const request = RESOURCE_TABS_BY_TYPE.request;

  it('detailRoute and matchDetailId are inverse, even for special characters', () => {
    for (const id of ['abc-123', 'a b', 'a/b', 'with%percent', 'unïcode']) {
      const route = request.detailRoute(id);
      expect(route.includes('/', '/requests/'.length)).toBe(false); // single encoded segment
      expect(request.matchDetailId(route)).toBe(id);
    }
  });

  it('matchDetailId rejects the list route', () => {
    expect(request.matchDetailId('/requests')).toBeNull();
  });
});

describe('resource-registry — makeResource (generic factory)', () => {
  it('normalises a trailing slash in basePath', () => {
    const r = makeResource({
      resourceType: 'y',
      label: 'Y',
      pendingTitle: 'Y',
      basePath: '/y/',
    });
    expect(r.listRoute).toBe('/y');
    expect(r.detailRoute('1')).toBe('/y/1');
    expect(r.isListRoute('/y')).toBe(true);
    expect(r.matchDetailId('/y/1')).toBe('1');
  });

  it('excludes declared static detail segments', () => {
    const r = makeResource({
      resourceType: 'x',
      label: 'X',
      pendingTitle: 'X',
      basePath: '/x',
      staticDetailSegments: ['new'],
    });
    expect(r.matchDetailId('/x/new')).toBeNull(); // not a record id
    expect(r.matchDetailId('/x/123')).toBe('123');
    expect(r.matchDetailId('/x/123/edit')).toBeNull(); // nested route
  });

  it('defaults enabled to true and honours an explicit false', () => {
    expect(makeResource({ resourceType: 'a', label: 'A', pendingTitle: 'A', basePath: '/a' }).enabled).toBe(true);
    expect(
      makeResource({ resourceType: 'b', label: 'B', pendingTitle: 'B', basePath: '/b', enabled: false }).enabled,
    ).toBe(false);
  });

  it('resolves declared idSubRoutes back to the record id', () => {
    const r = makeResource({
      resourceType: 'q',
      label: 'Q',
      pendingTitle: 'Q',
      basePath: '/q',
      staticDetailSegments: ['new'],
      idSubRoutes: ['edit'],
    });
    expect(r.matchDetailId('/q/123/edit')).toBe('123'); // nested edit → record id
    expect(r.matchDetailId('/q/123')).toBe('123'); // plain detail still works
    expect(r.matchDetailId('/q/new')).toBeNull(); // static segment
    expect(r.matchDetailId('/q/new/edit')).toBeNull(); // static id never a record
    expect(r.matchDetailId('/q/123/foo')).toBeNull(); // undeclared sub-route
    expect(r.detailRoute('123')).toBe('/q/123'); // detailRoute points at the record, not /edit
  });
});

describe('resource-registry — REQ2A registered resources', () => {
  it('registers quote, project, planning and inspection (all enabled)', () => {
    for (const rt of ['quote', 'project', 'planning', 'inspection']) {
      expect(RESOURCE_TABS_BY_TYPE[rt]).toBeTruthy();
      expect(RESOURCE_TABS_BY_TYPE[rt].enabled).toBe(true);
    }
  });

  it('quote: /quotes/:id is a tab, /quotes/new is not', () => {
    expect(findResourceByPath('/quotes/abc-1')).toEqual({
      kind: 'detail',
      resource: RESOURCE_TABS_BY_TYPE.quote,
      id: 'abc-1',
    });
    expect(findResourceByPath('/quotes/new')).toBeNull();
    expect(findResourceByPath('/quotes')).toEqual({
      kind: 'list',
      resource: RESOURCE_TABS_BY_TYPE.quote,
    });
  });

  it('quote: /quotes/:id/edit keeps the record tab active', () => {
    const match = findResourceByPath('/quotes/abc-1/edit');
    expect(match?.kind).toBe('detail');
    expect(match && match.kind === 'detail' && match.id).toBe('abc-1');
    expect(findResourceByPath('/quotes/new/edit')).toBeNull(); // never a record
  });

  it('planning: /planning/new is not a tab but /planning/:id is', () => {
    expect(findResourceByPath('/planning/new')).toBeNull();
    expect(findResourceByPath('/planning/p1')?.kind).toBe('detail');
  });

  it('project/inspection: nested routes do not resolve (no idSubRoutes)', () => {
    expect(findResourceByPath('/projects/p1')?.kind).toBe('detail');
    expect(findResourceByPath('/projects/p1/edit')).toBeNull();
    expect(findResourceByPath('/inspections/i1')?.kind).toBe('detail');
    expect(findResourceByPath('/inspections/i1/foo')).toBeNull();
  });
});
