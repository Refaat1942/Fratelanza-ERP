import { validateAppConfig, loadApiConfig, type AppConfig } from '@fratelanza/config';

describe('Production configuration validation (Phase 10.0)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function prodConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = overrides.DATABASE_URL ?? 'postgresql://user:pass@localhost:5432/fratelanza_erp';
    process.env.JWT_SECRET = overrides.JWT_SECRET ?? 'production-jwt-secret-minimum-32-characters-long';
    process.env.LICENSE_VERIFICATION_PUBLIC_KEY = overrides.LICENSE_VERIFICATION_PUBLIC_KEY ?? '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAtest\n-----END PUBLIC KEY-----';
    process.env.LICENSE_ALLOW_UNSIGNED_DEV = overrides.LICENSE_ALLOW_UNSIGNED_DEV ?? 'false';
    process.env.LICENSE_SIGNING_PRIVATE_KEY = overrides.LICENSE_SIGNING_PRIVATE_KEY ?? '';
    process.env.FRATELANZA_INSTALLATION_ID = overrides.FRATELANZA_INSTALLATION_ID ?? 'install-test-001';
    return loadApiConfig();
  }

  it('accepts a valid production configuration', () => {
    expect(() => validateAppConfig(prodConfig())).not.toThrow();
  });

  it('rejects missing LICENSE_VERIFICATION_PUBLIC_KEY in production', () => {
    expect(() =>
      validateAppConfig(prodConfig({ LICENSE_VERIFICATION_PUBLIC_KEY: '' })),
    ).toThrow(/LICENSE_VERIFICATION_PUBLIC_KEY/);
  });

  it('rejects LICENSE_ALLOW_UNSIGNED_DEV in production', () => {
    expect(() =>
      validateAppConfig(prodConfig({ LICENSE_ALLOW_UNSIGNED_DEV: 'true' })),
    ).toThrow(/LICENSE_ALLOW_UNSIGNED_DEV/);
  });

  it('rejects LICENSE_SIGNING_PRIVATE_KEY on customer production server', () => {
    expect(() =>
      validateAppConfig(prodConfig({ LICENSE_SIGNING_PRIVATE_KEY: 'private-key-material' })),
    ).toThrow(/LICENSE_SIGNING_PRIVATE_KEY/);
  });

  it('rejects missing FRATELANZA_INSTALLATION_ID in production', () => {
    expect(() =>
      validateAppConfig(prodConfig({ FRATELANZA_INSTALLATION_ID: '' })),
    ).toThrow(/FRATELANZA_INSTALLATION_ID/);
  });
});
