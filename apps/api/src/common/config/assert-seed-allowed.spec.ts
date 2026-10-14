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

  describe('F11: niet-lokale DATABASE_URL-host', () => {
    const remote = 'postgresql://u:p@db.staging.inspexi.nl:5432/inspectie?schema=public';

    it('weigert een niet-lokale host, ongeacht NODE_ENV', () => {
      expect(() => assertSeedAllowed({ NODE_ENV: 'development', DATABASE_URL: remote })).toThrow(
        /GEWEIGERD.*niet-lokale host \("db\.staging\.inspexi\.nl"\)/,
      );
      expect(() => assertSeedAllowed({ DATABASE_URL: 'postgres://u:p@10.0.0.5/x' })).toThrow(
        /niet-lokale host/,
      );
    });

    it('staat localhost, loopback-IP\'s en docker-servicenamen toe', () => {
      for (const url of [
        'postgresql://inspectie:pw@localhost:5433/inspectie?schema=public',
        'postgresql://u:p@127.0.0.1:5432/x',
        'postgresql://u:p@[::1]:5432/x',
        'postgresql://u:p@postgres:5432/x',
        'postgresql://u:p@db/x',
      ]) {
        expect(() => assertSeedAllowed({ NODE_ENV: 'test', DATABASE_URL: url })).not.toThrow();
      }
    });

    it('laat een ontbrekende of onparseerbare DATABASE_URL over aan Prisma (geen valse weigering)', () => {
      expect(() => assertSeedAllowed({ DATABASE_URL: undefined })).not.toThrow();
      expect(() => assertSeedAllowed({ DATABASE_URL: 'not a url' })).not.toThrow();
    });

    it('overrult met FORCE_SEED=1', () => {
      expect(() =>
        assertSeedAllowed({ NODE_ENV: 'development', DATABASE_URL: remote, FORCE_SEED: '1' }),
      ).not.toThrow();
    });
  });

  it('laat test/development/unset ongemoeid (e2e-flow seedt continu)', () => {
    expect(() => assertSeedAllowed({ NODE_ENV: 'test' })).not.toThrow();
    expect(() => assertSeedAllowed({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertSeedAllowed({})).not.toThrow();
    expect(() => assertSeedAllowed({ NODE_ENV: undefined })).not.toThrow();
  });
});
