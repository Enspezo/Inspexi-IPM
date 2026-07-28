import '@testing-library/jest-dom';

// Mock window.location voor tenant-detectie (lib/tenant.ts leest hostname).
const locationMock = {
  hostname: 'localhost',
  protocol: 'http:',
  port: '5174',
  href: 'http://localhost:5174/',
  pathname: '/',
  search: '',
  hash: '',
  origin: 'http://localhost:5174',
  assign: vi.fn(),
  replace: vi.fn(),
  reload: vi.fn(),
};

Object.defineProperty(window, 'location', {
  value: locationMock,
  writable: true,
});

// Mock URL.createObjectURL / revokeObjectURL (foto-previews en blob-downloads).
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();
