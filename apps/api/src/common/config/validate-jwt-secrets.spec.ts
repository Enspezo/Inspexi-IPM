import { validateJwtSecrets } from './validate-jwt-secrets';

// Vier onderling verschillende, willekeurige secrets van 48 tekens.
const distinct = {
  JWT_SECRET: 'q7Rk2vXp9LmN4tYb8WcZ3hJf6sDg1aEu5oPi0nMxKwVjTyQr',
  JWT_REFRESH_SECRET: 'Hn3Ld8ZqWx5Rv2Kt9Pm6Yc1Bf4Gs7Je0Ua3Oi6Nw9Ek2Tz5X',
  CLIENT_JWT_SECRET: 'tF6yU1iO4pA7sD0fG3hJ6kL9zX2cV5bN8mQ1wE4rT7yU0iOp',
  CLIENT_JWT_REFRESH_SECRET: 'Zb9Xn2Mc5Vl8Kj1Hg4Fd7Sa0Pq3Wo6Ei9Ru2Ty5Ux8Iz1Ao4',
};

// De letterlijke voorbeeldwaarden uit apps/api/.env.example.
const exampleEnv = {
  JWT_SECRET: 'dev-only-jwt-secret-vervang-mij-0001',
  JWT_REFRESH_SECRET: 'dev-only-jwt-refresh-secret-vervang-mij-0002',
  CLIENT_JWT_SECRET: 'dev-only-client-jwt-secret-vervang-mij-0003',
  CLIENT_JWT_REFRESH_SECRET: 'dev-only-client-jwt-refresh-secret-vervang-mij-0004',
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

  it('rejects the .env.example values in production', () => {
    expect(() => validateJwtSecrets({ ...exampleEnv }, 'production')).toThrow(
      /CLIENT_JWT_REFRESH_SECRET staat nog op een voorbeeldwaarde uit \.env\.example/,
    );
    // Eén enkele voorbeeldwaarde tussen verder sterke secrets is ook genoeg.
    expect(() =>
      validateJwtSecrets({ ...distinct, JWT_SECRET: exampleEnv.JWT_SECRET }, 'production'),
    ).toThrow(/JWT_SECRET staat nog op een voorbeeldwaarde/);
  });

  it('rejects values carrying an example marker in production (case-insensitive)', () => {
    const env = {
      ...distinct,
      CLIENT_JWT_SECRET: 'prod-secret-VERVANG-MIJ-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    };
    expect(() => validateJwtSecrets(env, 'production')).toThrow(
      /CLIENT_JWT_SECRET staat nog op een voorbeeldwaarde/,
    );
    const env2 = { ...distinct, JWT_SECRET: 'Dev-Only-' + distinct.JWT_SECRET };
    expect(() => validateJwtSecrets(env2, 'production')).toThrow(/JWT_SECRET staat nog/);
  });

  it('rejects a secret shorter than 32 characters in production', () => {
    const env = { ...distinct, JWT_REFRESH_SECRET: 'x'.repeat(31) };
    expect(() => validateJwtSecrets(env, 'production')).toThrow(
      /JWT_REFRESH_SECRET is te kort \(minimaal 32 tekens vereist\)/,
    );
    expect(() =>
      validateJwtSecrets({ ...distinct, JWT_REFRESH_SECRET: 'x'.repeat(32) }, 'production'),
    ).not.toThrow();
  });

  it('accepts the .env.example values and short secrets outside production', () => {
    expect(() => validateJwtSecrets({ ...exampleEnv }, 'test')).not.toThrow();
    expect(() => validateJwtSecrets({ ...exampleEnv }, 'development')).not.toThrow();
    expect(() => validateJwtSecrets({ ...distinct, JWT_SECRET: 'kort' }, 'test')).not.toThrow();
  });
});
