import { assertSeedAllowed } from './assert-seed-allowed';

describe('assertSeedAllowed (productie-guard seed-scripts)', () => {
  it('weigert bij NODE_ENV=production zonder FORCE_SEED', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'production' })).toThrow(
      /GEWEIGERD.*productie/,
    );
  });

  it('weigert bij NODE_ENV=production met FORCE_SEED op iets anders dan "1"', () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: 'production', FORCE_SEED: 'true' }),
    ).toThrow(/FORCE_SEED=1/);
    expect(() =>
      assertSeedAllowed({ NODE_ENV: 'production', FORCE_SEED: '0' }),
    ).toThrow();
  });

  it('staat NODE_ENV=production toe met expliciete FORCE_SEED=1', () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: 'production', FORCE_SEED: '1' }),
    ).not.toThrow();
  });

  it('laat test/development/unset ongemoeid (e2e-flow seedt continu)', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'test' })).not.toThrow();
    expect(() => assertSeedAllowed({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertSeedAllowed({})).not.toThrow();
    expect(() => assertSeedAllowed({ NODE_ENV: undefined })).not.toThrow();
  });
});
