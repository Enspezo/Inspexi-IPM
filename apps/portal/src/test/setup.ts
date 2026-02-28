import '@testing-library/jest-dom';

// Mock window.location for tenant tests
const locationMock = {
  hostname: 'localhost',
  protocol: 'http:',
  port: '5173',
  href: 'http://localhost:5173/',
  pathname: '/',
  search: '',
  hash: '',
  origin: 'http://localhost:5173',
  assign: vi.fn(),
  replace: vi.fn(),
  reload: vi.fn(),
};

Object.defineProperty(window, 'location', {
  value: locationMock,
  writable: true,
});

// Mock URL.createObjectURL / revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();
