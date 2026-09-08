import { validateAppConfig, loadApiConfig, type AppConfig } from '@fratelanza/config';

describe('Production configuration validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function prodConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = overrides.DATABASE_URL ?? 'postgresql://user:pass@localhost:5432/fratelanza_eval';
    process.env.JWT_SECRET = overrides.JWT_SECRET ?? 'production-jwt-secret-minimum-32-characters-long';
    return loadApiConfig();
  }

  it('accepts a valid production configuration without licensing env vars', () => {
    expect(() => validateAppConfig(prodConfig())).not.toThrow();
  });

  it('rejects placeholder JWT_SECRET in production', () => {
    expect(() =>
      validateAppConfig(prodConfig({ JWT_SECRET: 'change-this-to-a-long-random-secret-in-production' })),
    ).toThrow(/JWT_SECRET/);
  });

  it('rejects missing DATABASE_URL', () => {
    expect(() =>
      validateAppConfig(prodConfig({ DATABASE_URL: '' })),
    ).toThrow(/DATABASE_URL/);
  });
});
