import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Role } from '@/types';

// Mutable mock state, set per-test before render.
const { navigateSpy, openSpy, authState } = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  openSpy: vi.fn(),
  authState: { user: null as { roles: Role[] } | null },
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateSpy };
});

vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => authState,
}));

vi.mock('@/providers/quick-create-provider', () => ({
  useQuickCreate: () => ({ open: openSpy }),
}));

import { QuickCreateButton } from './quick-create-button';

function setUser(roles: Role[] | null) {
  authState.user = roles ? { roles } : null;
}

describe('QuickCreateButton', () => {
  beforeEach(() => {
    navigateSpy.mockClear();
    openSpy.mockClear();
    cleanup();
  });

  it('shows all six items for an ORG_ADMIN', () => {
    setUser([Role.ORG_ADMIN]);
    render(<QuickCreateButton />);

    expect(screen.getByText('Nieuwe relatie')).toBeInTheDocument();
    expect(screen.getByText('Nieuwe contactpersoon')).toBeInTheDocument();
    expect(screen.getByText('Nieuwe locatie')).toBeInTheDocument();
    expect(screen.getByText('Nieuwe aanvraag')).toBeInTheDocument();
    expect(screen.getByText('Nieuwe offerte')).toBeInTheDocument();
    expect(screen.getByText('Nieuw project')).toBeInTheDocument();
  });

  it('hides write-gated items for an INSPECTEUR (only contactpersoon + locatie remain)', () => {
    setUser([Role.INSPECTEUR]);
    render(<QuickCreateButton />);

    expect(screen.queryByText('Nieuwe relatie')).not.toBeInTheDocument();
    expect(screen.queryByText('Nieuwe aanvraag')).not.toBeInTheDocument();
    expect(screen.queryByText('Nieuwe offerte')).not.toBeInTheDocument();
    expect(screen.queryByText('Nieuw project')).not.toBeInTheDocument();

    expect(screen.getByText('Nieuwe contactpersoon')).toBeInTheDocument();
    expect(screen.getByText('Nieuwe locatie')).toBeInTheDocument();
  });

  it('shows the project item for a WERKVOORBEREIDER but not the CRM-write items', () => {
    setUser([Role.WERKVOORBEREIDER]);
    render(<QuickCreateButton />);

    expect(screen.getByText('Nieuw project')).toBeInTheDocument();
    expect(screen.queryByText('Nieuwe relatie')).not.toBeInTheDocument();
    expect(screen.queryByText('Nieuwe offerte')).not.toBeInTheDocument();
  });

  it('opens the contact flow when "Nieuwe relatie" is clicked', () => {
    setUser([Role.MANAGER]);
    render(<QuickCreateButton />);

    fireEvent.click(screen.getByText('Nieuwe relatie'));
    expect(openSpy).toHaveBeenCalledWith('contact');
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('navigates to /quotes/new when "Nieuwe offerte" is clicked', () => {
    setUser([Role.BACKOFFICE]);
    render(<QuickCreateButton />);

    fireEvent.click(screen.getByText('Nieuwe offerte'));
    expect(navigateSpy).toHaveBeenCalledWith('/quotes/new');
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('opens the location flow when "Nieuwe locatie" is clicked', () => {
    setUser([Role.INSPECTEUR]);
    render(<QuickCreateButton />);

    fireEvent.click(screen.getByText('Nieuwe locatie'));
    expect(openSpy).toHaveBeenCalledWith('location');
  });
});
