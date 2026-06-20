import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

// jsdom runs on an opaque origin, where the real localStorage no-ops (and
// tenantStorage swallows the error). Back it with an in-memory store so the
// load/persist round-trip is exercised deterministically.
vi.mock('@/lib/storage', () => {
  const store = new Map<string, string>();
  return {
    tenantStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
});

import { WindowTabsProvider } from '@/providers/window-tabs';
import { tenantStorage } from '@/lib/storage';
import { WindowTabStrip } from './window-tab-strip';

/** Reflects the current pathname so navigation side-effects are assertable. */
function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function seedTabs(ids: string[]) {
  tenantStorage.setItem(
    'window-tabs',
    JSON.stringify({
      request: ids.map((id) => ({ resourceType: 'request', id, title: `Titel ${id}` })),
    }),
  );
}

function renderStrip(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <WindowTabsProvider>
        <WindowTabStrip />
        <LocationProbe />
      </WindowTabsProvider>
    </MemoryRouter>,
  );
}

describe('WindowTabStrip', () => {
  beforeEach(() => {
    cleanup();
    // Reset the only key the provider touches (jsdom's localStorage has no clear()).
    tenantStorage.removeItem('window-tabs');
  });

  it('renders the anchor plus a tab per open record on a list route', () => {
    seedTabs(['a', 'b']);
    renderStrip('/requests');

    expect(screen.getByRole('tablist', { name: /geopende aanvragen/i })).toBeInTheDocument();
    expect(screen.getByText('Aanvragen')).toBeInTheDocument();
    expect(screen.getByText('Titel a')).toBeInTheDocument();
    expect(screen.getByText('Titel b')).toBeInTheDocument();

    // Anchor is the active tab on the list route.
    expect(screen.getByRole('tab', { name: /aanvragen/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('does not render on a route without a tab-domein, even with open tabs', () => {
    seedTabs(['a']);
    renderStrip('/contacts');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('marks the record tab matching the URL as active', () => {
    seedTabs(['a', 'b']);
    renderStrip('/requests/b');

    const tabB = screen.getByText('Titel b').closest('[role="tab"]');
    const tabA = screen.getByText('Titel a').closest('[role="tab"]');
    expect(tabB).toHaveAttribute('aria-selected', 'true');
    expect(tabA).toHaveAttribute('aria-selected', 'false');
  });

  it('auto-adds a tab when landing directly on a detail URL', async () => {
    // No seeded tabs — the provider derives the tab from the URL.
    renderStrip('/requests/fresh-id');

    expect(await screen.findByText('Aanvraag')).toBeInTheDocument();
    const tab = screen.getByText('Aanvraag').closest('[role="tab"]');
    expect(tab).toHaveAttribute('aria-selected', 'true');
  });

  it('closes a tab via its ✕ button and persists the change', async () => {
    seedTabs(['a', 'b']);
    renderStrip('/requests'); // anchor active → closing a record tab does not navigate

    fireEvent.click(screen.getByRole('button', { name: 'Titel a sluiten' }));

    expect(screen.queryByText('Titel a')).not.toBeInTheDocument();
    expect(screen.getByText('Titel b')).toBeInTheDocument();

    await waitFor(() => {
      const raw = tenantStorage.getItem('window-tabs');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw!).request.map((t: { id: string }) => t.id)).toEqual(['b']);
    });
  });

  it('closes a tab on middle-click', () => {
    seedTabs(['a', 'b']);
    renderStrip('/requests');

    const tabA = screen.getByText('Titel a').closest('[role="tab"]')!;
    fireEvent.mouseDown(tabA, { button: 1 });

    expect(screen.queryByText('Titel a')).not.toBeInTheDocument();
  });

  it('falls back to the neighbour tab when the active tab is closed', () => {
    seedTabs(['a', 'b']);
    renderStrip('/requests/a');

    fireEvent.click(screen.getByRole('button', { name: 'Titel a sluiten' }));

    expect(screen.getByTestId('loc')).toHaveTextContent('/requests/b');
    expect(screen.queryByText('Titel a')).not.toBeInTheDocument();
  });

  it('falls back to the anchor when the last tab is closed', () => {
    seedTabs(['a']);
    renderStrip('/requests/a');

    fireEvent.click(screen.getByRole('button', { name: 'Titel a sluiten' }));

    expect(screen.getByTestId('loc')).toHaveTextContent('/requests');
    // Strip hides once no record tabs remain.
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('"Sluit alle tabbladen" clears every record tab', () => {
    seedTabs(['a', 'b', 'c']);
    renderStrip('/requests');

    fireEvent.click(screen.getByRole('button', { name: /tabblad-acties/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /sluit alle tabbladen/i }));

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByTestId('loc')).toHaveTextContent('/requests');
  });

  it('"Sluit andere tabbladen" keeps only the active tab', () => {
    seedTabs(['a', 'b', 'c']);
    renderStrip('/requests/b');

    fireEvent.click(screen.getByRole('button', { name: /tabblad-acties/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /sluit andere tabbladen/i }));

    expect(screen.getByText('Titel b')).toBeInTheDocument();
    expect(screen.queryByText('Titel a')).not.toBeInTheDocument();
    expect(screen.queryByText('Titel c')).not.toBeInTheDocument();
  });

  it('disables "Sluit andere" when the anchor is active', () => {
    seedTabs(['a', 'b']);
    renderStrip('/requests');

    fireEvent.click(screen.getByRole('button', { name: /tabblad-acties/i }));
    expect(screen.getByRole('menuitem', { name: /sluit andere tabbladen/i })).toBeDisabled();
  });

  it('does not show a ✕ on the anchor tab', () => {
    seedTabs(['a']);
    renderStrip('/requests');
    const anchor = screen.getByRole('tab', { name: /aanvragen/i });
    expect(within(anchor).queryByRole('button')).not.toBeInTheDocument();
  });
});
