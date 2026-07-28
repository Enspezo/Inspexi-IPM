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

  // B-315 §7: een INSPECTEUR krijgt 403 op /contacts en kan de contactpersoon-/
  // locatie-flows nooit afronden — de hele knop verdwijnt daarom voor die rol.
  it('B-315 §7: hides ALL items (and the button) for an INSPECTEUR', () => {
    setUser([Role.INSPECTEUR]);
    const { container } = render(<QuickCreateButton />);

    expect(screen.queryByText('Nieuwe relatie')).not.toBeInTheDocument();
    expect(screen.queryByText('Nieuwe aanvraag')).not.toBeInTheDocument();
    expect(screen.queryByText('Nieuwe offerte')).not.toBeInTheDocument();
    expect(screen.queryByText('Nieuw project')).not.toBeInTheDocument();
    expect(screen.queryByText('Nieuwe contactpersoon')).not.toBeInTheDocument();
    expect(screen.queryByText('Nieuwe locatie')).not.toBeInTheDocument();
    // Geen enkel item → knop volledig verborgen.
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the project item for a WERKVOORBEREIDER but not the CRM-write items', () => {
    setUser([Role.WERKVOORBEREIDER]);
    render(<QuickCreateButton />);

    expect(screen.getByText('Nieuw project')).toBeInTheDocument();
    // WERKVOORBEREIDER heeft CRM-leestoegang → contactpersoon/locatie blijven.
    expect(screen.getByText('Nieuwe contactpersoon')).toBeInTheDocument();
    expect(screen.getByText('Nieuwe locatie')).toBeInTheDocument();
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
    setUser([Role.BACKOFFICE]);
    render(<QuickCreateButton />);

    fireEvent.click(screen.getByText('Nieuwe locatie'));
    expect(openSpy).toHaveBeenCalledWith('location');
  });
});
