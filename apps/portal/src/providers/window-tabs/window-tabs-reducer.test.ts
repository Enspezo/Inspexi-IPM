import { describe, it, expect } from 'vitest';
import {
  windowTabsReducer,
  type WindowTabsState,
} from './window-tabs-reducer';

const RT = 'request';

function tab(id: string, title = `Titel ${id}`) {
  return { resourceType: RT, id, title };
}

function seed(...ids: string[]): WindowTabsState {
  return { [RT]: ids.map((id) => ({ ...tab(id), missing: false })) };
}

describe('windowTabsReducer', () => {
  describe('open', () => {
    it('appends a new tab to an empty domain', () => {
      const next = windowTabsReducer({}, { type: 'open', resourceType: RT, tab: tab('a') });
      expect(next[RT]).toEqual([{ resourceType: RT, id: 'a', title: 'Titel a', missing: false }]);
    });

    it('updates the title (and clears missing) for an existing tab without duplicating', () => {
      const start: WindowTabsState = { [RT]: [{ ...tab('a'), missing: true }] };
      const next = windowTabsReducer(start, {
        type: 'open',
        resourceType: RT,
        tab: { resourceType: RT, id: 'a', title: 'Nieuwe titel' },
      });
      expect(next[RT]).toHaveLength(1);
      expect(next[RT][0]).toMatchObject({ id: 'a', title: 'Nieuwe titel', missing: false });
    });

    it('preserves order when adding multiple tabs', () => {
      let state: WindowTabsState = {};
      for (const id of ['a', 'b', 'c']) {
        state = windowTabsReducer(state, { type: 'open', resourceType: RT, tab: tab(id) });
      }
      expect(state[RT].map((t) => t.id)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('ensure', () => {
    it('adds a tab when absent', () => {
      const next = windowTabsReducer({}, { type: 'ensure', resourceType: RT, tab: tab('a', 'Aanvraag') });
      expect(next[RT]).toHaveLength(1);
      expect(next[RT][0].title).toBe('Aanvraag');
    });

    it('is a no-op (same reference, keeps title) when the tab already exists', () => {
      const start = seed('a');
      const next = windowTabsReducer(start, {
        type: 'ensure',
        resourceType: RT,
        tab: tab('a', 'Placeholder'),
      });
      expect(next).toBe(start);
      expect(next[RT][0].title).toBe('Titel a');
    });
  });

  describe('close', () => {
    it('removes the matching tab', () => {
      const next = windowTabsReducer(seed('a', 'b', 'c'), { type: 'close', resourceType: RT, id: 'b' });
      expect(next[RT].map((t) => t.id)).toEqual(['a', 'c']);
    });

    it('is a no-op (same reference) when the tab is absent', () => {
      const start = seed('a');
      const next = windowTabsReducer(start, { type: 'close', resourceType: RT, id: 'zzz' });
      expect(next).toBe(start);
    });
  });

  describe('closeOthers', () => {
    it('keeps only the given tab', () => {
      const next = windowTabsReducer(seed('a', 'b', 'c'), {
        type: 'closeOthers',
        resourceType: RT,
        keepId: 'b',
      });
      expect(next[RT].map((t) => t.id)).toEqual(['b']);
    });

    it('clears all tabs when keepId is null', () => {
      const next = windowTabsReducer(seed('a', 'b'), {
        type: 'closeOthers',
        resourceType: RT,
        keepId: null,
      });
      expect(next[RT]).toEqual([]);
    });

    it('is a no-op when only the kept tab is open', () => {
      const start = seed('a');
      const next = windowTabsReducer(start, { type: 'closeOthers', resourceType: RT, keepId: 'a' });
      expect(next).toBe(start);
    });
  });

  describe('closeAll', () => {
    it('empties the domain', () => {
      const next = windowTabsReducer(seed('a', 'b'), { type: 'closeAll', resourceType: RT });
      expect(next[RT]).toEqual([]);
    });

    it('is a no-op (same reference) when already empty', () => {
      const start: WindowTabsState = { [RT]: [] };
      const next = windowTabsReducer(start, { type: 'closeAll', resourceType: RT });
      expect(next).toBe(start);
    });
  });

  describe('setTitle', () => {
    it('updates the title of an existing tab', () => {
      const next = windowTabsReducer(seed('a'), {
        type: 'setTitle',
        resourceType: RT,
        id: 'a',
        title: 'Bijgewerkt',
      });
      expect(next[RT][0].title).toBe('Bijgewerkt');
    });

    it('is a no-op (same reference) when the title is unchanged', () => {
      const start = seed('a');
      const next = windowTabsReducer(start, {
        type: 'setTitle',
        resourceType: RT,
        id: 'a',
        title: 'Titel a',
      });
      expect(next).toBe(start);
    });

    it('is a no-op when the tab is absent', () => {
      const start = seed('a');
      const next = windowTabsReducer(start, {
        type: 'setTitle',
        resourceType: RT,
        id: 'zzz',
        title: 'x',
      });
      expect(next).toBe(start);
    });
  });

  describe('setMissing', () => {
    it('flags an existing tab as missing', () => {
      const next = windowTabsReducer(seed('a'), {
        type: 'setMissing',
        resourceType: RT,
        id: 'a',
        missing: true,
      });
      expect(next[RT][0].missing).toBe(true);
    });

    it('is a no-op (same reference) when the flag is unchanged', () => {
      const start = seed('a'); // missing: false
      const next = windowTabsReducer(start, {
        type: 'setMissing',
        resourceType: RT,
        id: 'a',
        missing: false,
      });
      expect(next).toBe(start);
    });
  });

  it('keeps separate domains isolated', () => {
    const start: WindowTabsState = { request: seed('a').request, quote: [] };
    const next = windowTabsReducer(start, { type: 'open', resourceType: RT, tab: tab('b') });
    expect(next.request.map((t) => t.id)).toEqual(['a', 'b']);
    expect(next.quote).toBe(start.quote);
  });
});
