import { validateJwtSecrets } from './validate-jwt-secrets';

const distinct = {
  JWT_SECRET: 'aaaa1',
  JWT_REFRESH_SECRET: 'bbbb2',
  CLIENT_JWT_SECRET: 'cccc3',
  CLIENT_JWT_REFRESH_SECRET: 'dddd4',
};

describe('validateJwtSecrets', () => {
  it('passes with four distinct, non-default secrets', () => {
    expect(() => validateJwtSecrets({ ...distinct }, 'production')).not.toThrow();
    expect(() => validateJwtSecrets({ ...distinct }, 'development')).not.toThrow();
  });

  it('throws when a secret is missing — regardless of NODE_ENV', () => {
    const env = { ...distinct, CLIENT_JWT_SECRET: undefined };
    expect(() => validateJwtSecrets(env, 'production')).toThrow(/CLIENT_JWT_SECRET ontbreekt/);
    expect(() => validateJwtSecrets(env, 'development')).toThrow(/CLIENT_JWT_SECRET ontbreekt/);
  });

  it('throws when a secret is empty/whitespace', () => {
    expect(() => validateJwtSecrets({ ...distinct, JWT_SECRET: '   ' }, 'development')).toThrow(
      /JWT_SECRET ontbreekt/,
    );
  });

  it('throws when a secret equals the placeholder — regardless of NODE_ENV', () => {
    const env = { ...distinct, JWT_REFRESH_SECRET: 'change-me-in-production' };
    expect(() => validateJwtSecrets(env, 'production')).toThrow(/JWT_REFRESH_SECRET/);
    expect(() => validateJwtSecrets(env, 'development')).toThrow(/JWT_REFRESH_SECRET/);
  });

  it('rejects mutually-equal secrets in production', () => {
    const env = { ...distinct, CLIENT_JWT_SECRET: distinct.JWT_SECRET };
    expect(() => validateJwtSecrets(env, 'production')).toThrow(
      /JWT_SECRET en CLIENT_JWT_SECRET mogen niet gelijk zijn/,
    );
  });

  it('allows mutually-equal (non-default) secrets outside production', () => {
    const shared = 'shared-dev-secret';
    const env = {
      JWT_SECRET: shared,
      JWT_REFRESH_SECRET: shared,
      CLIENT_JWT_SECRET: shared,
      CLIENT_JWT_REFRESH_SECRET: shared,
    };
    expect(() => validateJwtSecrets(env, 'development')).not.toThrow();
    expect(() => validateJwtSecrets(env, undefined)).not.toThrow();
  });
});
