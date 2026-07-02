import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Role } from '@/types';
import type { SidebarCounts } from './use-sidebar-counts';

// Mutable mock state, set per-test before render.
const { authState, countsState } = vi.hoisted(() => ({
  authState: { user: null as { roles: Role[] } | null },
  countsState: {
    value: { favorites: 0, notifications: 0, tasks: 0, notes: 0 } as SidebarCounts,
  },
}));

vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => authState,
}));

vi.mock('./use-sidebar-counts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./use-sidebar-counts')>();
  return { ...actual, useSidebarCounts: () => countsState.value };
});

import { SidebarBottomBar } from './sidebar-bottom-bar';

function setUser(roles: Role[] | null) {
  authState.user = roles ? { roles } : null;
}

function setCounts(counts: Partial<SidebarCounts>) {
  countsState.value = { favorites: 0, notifications: 0, tasks: 0, notes: 0, ...counts };
}

function renderBar(collapsed = false) {
  return render(
    <MemoryRouter>
      <SidebarBottomBar collapsed={collapsed} />
    </MemoryRouter>,
  );
}

describe('SidebarBottomBar', () => {
  beforeEach(() => {
    setUser([Role.ORG_ADMIN]);
    setCounts({});
    cleanup();
  });

  it('renders all four personal models for a CRM user, in fixed order', () => {
    setUser([Role.ORG_ADMIN]);
    renderBar();

    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('aria-label'))).toEqual([
      'Favorieten',
      'Notificaties',
      'Taken',
      'Notities',
    ]);
    // each links to its own route
    expect(screen.getByRole('link', { name: 'Favorieten' })).toHaveAttribute('href', '/favorites');
    expect(screen.getByRole('link', { name: 'Notificaties' })).toHaveAttribute('href', '/notifications');
    expect(screen.getByRole('link', { name: 'Taken' })).toHaveAttribute('href', '/tasks');
    expect(screen.getByRole('link', { name: 'Notities' })).toHaveAttribute('href', '/notities');
  });

  it('shows a badge only for models with a count > 0', () => {
    setUser([Role.MANAGER]);
    setCounts({ favorites: 3, notifications: 0, tasks: 12, notes: 7 });
    renderBar();

    expect(within(screen.getByRole('link', { name: 'Favorieten' })).getByText('3')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: 'Taken' })).getByText('12')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: 'Notities' })).getByText('7')).toBeInTheDocument();
    // notifications == 0 → no badge text
    expect(
      within(screen.getByRole('link', { name: 'Notificaties' })).queryByText('0'),
    ).not.toBeInTheDocument();
  });

  it('caps the badge at 99+', () => {
    setUser([Role.ORG_ADMIN]);
    setCounts({ favorites: 150 });
    renderBar();

    expect(within(screen.getByRole('link', { name: 'Favorieten' })).getByText('99+')).toBeInTheDocument();
  });

  it('hides Taken and Notities for a non-CRM role (INSPECTEUR)', () => {
    setUser([Role.INSPECTEUR]);
    setCounts({ tasks: 5, notes: 4 });
    renderBar();

    expect(screen.getByRole('link', { name: 'Favorieten' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Notificaties' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Taken' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Notities' })).not.toBeInTheDocument();
  });

  it('renders the same four icons when collapsed', () => {
    setUser([Role.ORG_ADMIN]);
    renderBar(true);

    expect(screen.getAllByRole('link')).toHaveLength(4);
  });
});
