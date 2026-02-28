import { describe, it, expect, beforeEach } from 'vitest';

// We need to re-import after changing window.location.hostname
// Using dynamic imports to reset module state
describe('tenant utilities', () => {
  beforeEach(() => {
    // Reset the cached base domain between tests
    vi.resetModules();
  });

  describe('getTenantInfo', () => {
    it('should return isBaseDomain=true for localhost', async () => {
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hostname: 'localhost' },
        writable: true,
      });

      const { getTenantInfo } = await import('./tenant');
      const info = getTenantInfo();

      expect(info.slug).toBeNull();
      expect(info.isBaseDomain).toBe(true);
    });

    it('should return isBaseDomain=true for mijn.localhost (superuser)', async () => {
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hostname: 'mijn.localhost' },
        writable: true,
      });

      const { getTenantInfo } = await import('./tenant');
      const info = getTenantInfo();

      expect(info.slug).toBeNull();
      expect(info.isBaseDomain).toBe(true);
    });

    it('should extract org slug from subdomain', async () => {
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hostname: 'inspexidemo.localhost' },
        writable: true,
      });

      const { getTenantInfo } = await import('./tenant');
      const info = getTenantInfo();

      expect(info.slug).toBe('inspexidemo');
      expect(info.isBaseDomain).toBe(false);
    });

    it('should return isBaseDomain=true for nested subdomains', async () => {
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hostname: 'a.b.localhost' },
        writable: true,
      });

      const { getTenantInfo } = await import('./tenant');
      const info = getTenantInfo();

      expect(info.slug).toBeNull();
      expect(info.isBaseDomain).toBe(true);
    });
  });

  describe('getOrgUrl', () => {
    it('should build a full URL for an org subdomain', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          hostname: 'localhost',
          protocol: 'http:',
          port: '5173',
        },
        writable: true,
      });

      const { getOrgUrl } = await import('./tenant');
      const url = getOrgUrl('testorg', '/dashboard');

      expect(url).toBe('http://testorg.localhost:5173/dashboard');
    });

    it('should default path to /', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          hostname: 'localhost',
          protocol: 'http:',
          port: '5173',
        },
        writable: true,
      });

      const { getOrgUrl } = await import('./tenant');
      const url = getOrgUrl('myorg');

      expect(url).toBe('http://myorg.localhost:5173/');
    });
  });

  describe('getBaseDomainUrl', () => {
    it('should build a URL for the superuser domain', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          hostname: 'inspexidemo.localhost',
          protocol: 'http:',
          port: '5173',
        },
        writable: true,
      });

      const { getBaseDomainUrl } = await import('./tenant');
      const url = getBaseDomainUrl('/login');

      expect(url).toBe('http://mijn.localhost:5173/login');
    });
  });

  describe('getBaseDomain', () => {
    it('should detect localhost as base domain', async () => {
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hostname: 'test.localhost' },
        writable: true,
      });

      const { getBaseDomain } = await import('./tenant');
      expect(getBaseDomain()).toBe('localhost');
    });

    it('should detect inspexi.nl as base domain', async () => {
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hostname: 'demo.inspexi.nl' },
        writable: true,
      });

      const { getBaseDomain } = await import('./tenant');
      expect(getBaseDomain()).toBe('inspexi.nl');
    });
  });
});
