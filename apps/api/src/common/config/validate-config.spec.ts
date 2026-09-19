import { checkConfig, validateConfig } from './validate-config';

const prodOk = {
  NODE_ENV: 'production',
  PUBLIC_URL: 'https://test.inspexi.nl',
  CONVERT_API_KEY: 'a-real-key',
  RESEND_API_KEY: 're_live_123',
  KVK_USE_TEST_ENV: 'false',
};

describe('validateConfig (F3 — fail-fast runtime-config)', () => {
  it('passes a complete production config without warnings', () => {
    expect(checkConfig(prodOk)).toEqual({ errors: [], warnings: [] });
    expect(() => validateConfig(prodOk)).not.toThrow();
  });

  it('keeps development/test permissive (dev server + e2e keep booting)', () => {
    for (const NODE_ENV of ['development', 'test', undefined]) {
      expect(checkConfig({ NODE_ENV, CONVERT_API_KEY: 'change-me-in-production' })).toEqual({
        errors: [],
        warnings: [],
      });
    }
  });

  it('rejects an unknown NODE_ENV in any mode and points at production for staging', () => {
    const { errors } = checkConfig({ ...prodOk, NODE_ENV: 'staging' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/NODE_ENV="staging" is onbekend/);
    expect(errors[0]).toMatch(/NODE_ENV=production/);
  });

  it('fails in production when PUBLIC_URL is missing', () => {
    expect(() => validateConfig({ ...prodOk, PUBLIC_URL: '  ' })).toThrow(/PUBLIC_URL ontbreekt/);
  });

  it('fails in production when CONVERT_API_KEY is still the placeholder', () => {
    expect(() =>
      validateConfig({ ...prodOk, CONVERT_API_KEY: 'change-me-in-production' }),
    ).toThrow(/CONVERT_API_KEY staat nog op de default-waarde/);
  });

  it('fails in production with a clear message when RESEND_API_KEY is missing', () => {
    expect(() => validateConfig({ ...prodOk, RESEND_API_KEY: undefined })).toThrow(
      /RESEND_API_KEY ontbreekt/,
    );
  });

  it('collects all errors in one message', () => {
    expect(() =>
      validateConfig({ NODE_ENV: 'production', CONVERT_API_KEY: 'change-me-in-production' }),
    ).toThrow(/PUBLIC_URL[\s\S]*CONVERT_API_KEY[\s\S]*RESEND_API_KEY/);
  });

  it('warns (does not fail) when KVK_USE_TEST_ENV=true in production', () => {
    const warn = jest.fn();
    expect(() => validateConfig({ ...prodOk, KVK_USE_TEST_ENV: 'TRUE' }, warn)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/KVK_USE_TEST_ENV=true in productie/);
  });
});
