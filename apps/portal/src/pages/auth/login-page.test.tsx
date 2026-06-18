import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Shared, mutable mock state — declared via vi.hoisted so the (hoisted)
// vi.mock factories below can reference it without TDZ errors.
const { navigateSpy, authState } = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  authState: {
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
  },
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateSpy };
});

vi.mock('@/providers/auth-provider', () => ({
  useAuth: () => authState,
}));

vi.mock('@/providers/tenant-provider', () => ({
  useTenant: () => ({
    orgBranding: null,
    isLoading: false,
    error: null,
    tenantInfo: { slug: 'inspexidemo', isBaseDomain: false },
  }),
}));

import LoginPage from './login-page';

function renderAt(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage returnTo redirect', () => {
  beforeEach(() => {
    navigateSpy.mockClear();
    authState.isAuthenticated = true;
    authState.isLoading = false;
  });

  it('redirects an authenticated user back to the original route (from)', () => {
    renderAt({ from: { pathname: '/contacts', search: '?page=2' } });
    expect(navigateSpy).toHaveBeenCalledWith('/contacts?page=2', {
      replace: true,
    });
  });

  it('preserves the path when there is no search string', () => {
    renderAt({ from: { pathname: '/asset-types', search: '' } });
    expect(navigateSpy).toHaveBeenCalledWith('/asset-types', { replace: true });
  });

  it('falls back to /dashboard when there is no returnTo', () => {
    renderAt(undefined);
    expect(navigateSpy).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('does not redirect while still unauthenticated', () => {
    authState.isAuthenticated = false;
    renderAt({ from: { pathname: '/contacts', search: '' } });
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
