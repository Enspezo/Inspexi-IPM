import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
          port: '5174',
        },
        writable: true,
      });

      const { getOrgUrl } = await import('./tenant');
      const url = getOrgUrl('testorg', '/dashboard');

      expect(url).toBe('http://testorg.localhost:5174/dashboard');
    });

    it('should default path to /', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          hostname: 'localhost',
          protocol: 'http:',
          port: '5174',
        },
        writable: true,
      });

      const { getOrgUrl } = await import('./tenant');
      const url = getOrgUrl('myorg');

      expect(url).toBe('http://myorg.localhost:5174/');
    });
  });

  describe('getBaseDomainUrl', () => {
    it('should build a URL for the superuser domain', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          hostname: 'inspexidemo.localhost',
          protocol: 'http:',
          port: '5174',
        },
        writable: true,
      });

      const { getBaseDomainUrl } = await import('./tenant');
      const url = getBaseDomainUrl('/login');

      expect(url).toBe('http://mijn.localhost:5174/login');
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

  describe('VITE_BASE_DOMAIN override', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should extract the org slug on a staging host when the base domain is configured', async () => {
      vi.stubEnv('VITE_BASE_DOMAIN', 'staging.example.com');
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hostname: 'inspexidemo.staging.example.com' },
        writable: true,
      });

      const { getTenantInfo, getBaseDomain } = await import('./tenant');

      expect(getBaseDomain()).toBe('staging.example.com');
      expect(getTenantInfo()).toEqual({ slug: 'inspexidemo', isBaseDomain: false });
    });

    it('should keep mijn.<base> as the superuser domain', async () => {
      vi.stubEnv('VITE_BASE_DOMAIN', 'staging.example.com');
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hostname: 'mijn.staging.example.com' },
        writable: true,
      });

      const { getTenantInfo } = await import('./tenant');
      expect(getTenantInfo()).toEqual({ slug: null, isBaseDomain: true });
    });

    it('should treat the bare base domain as base-domain context', async () => {
      vi.stubEnv('VITE_BASE_DOMAIN', 'staging.example.com');
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hostname: 'staging.example.com' },
        writable: true,
      });

      const { getTenantInfo } = await import('./tenant');
      expect(getTenantInfo()).toEqual({ slug: null, isBaseDomain: true });
    });

    it('should not resolve a slug for hosts outside the configured base domain', async () => {
      vi.stubEnv('VITE_BASE_DOMAIN', 'staging.example.com');
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hostname: 'inspexidemo.localhost' },
        writable: true,
      });

      const { getTenantInfo } = await import('./tenant');
      expect(getTenantInfo()).toEqual({ slug: null, isBaseDomain: true });
    });

    it('should not resolve a slug for nested labels under the configured base domain', async () => {
      vi.stubEnv('VITE_BASE_DOMAIN', 'staging.example.com');
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hostname: 'a.b.staging.example.com' },
        writable: true,
      });

      const { getTenantInfo } = await import('./tenant');
      expect(getTenantInfo()).toEqual({ slug: null, isBaseDomain: true });
    });

    it('should build org and superuser URLs on the configured base domain', async () => {
      vi.stubEnv('VITE_BASE_DOMAIN', 'staging.example.com');
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          hostname: 'inspexidemo.staging.example.com',
          protocol: 'https:',
          port: '',
        },
        writable: true,
      });

      const { getOrgUrl, getBaseDomainUrl } = await import('./tenant');
      expect(getOrgUrl('testorg', '/dashboard')).toBe('https://testorg.staging.example.com/dashboard');
      expect(getBaseDomainUrl('/login')).toBe('https://mijn.staging.example.com/login');
    });

    it('should normalise a leading dot and casing in the configured value', async () => {
      vi.stubEnv('VITE_BASE_DOMAIN', '.Staging.Example.com');
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hostname: 'demo.staging.example.com' },
        writable: true,
      });

      const { getTenantInfo, getBaseDomain } = await import('./tenant');
      expect(getBaseDomain()).toBe('staging.example.com');
      expect(getTenantInfo().slug).toBe('demo');
    });

    it('should fall back to the heuristic when the value is empty', async () => {
      vi.stubEnv('VITE_BASE_DOMAIN', '   ');
      Object.defineProperty(window, 'location', {
        value: { ...window.location, hostname: 'inspexidemo.localhost' },
        writable: true,
      });

      const { getTenantInfo, getBaseDomain } = await import('./tenant');
      expect(getBaseDomain()).toBe('localhost');
      expect(getTenantInfo()).toEqual({ slug: 'inspexidemo', isBaseDomain: false });
    });
  });
});
