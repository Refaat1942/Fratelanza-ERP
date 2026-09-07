import { loadApiConfig, validateAppConfig, type AppConfig } from '@fratelanza/config';

let cachedConfig: AppConfig | null = null;

export function getAppConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = loadApiConfig();
  }
  return cachedConfig;
}

export function resetAppConfigCache(): void {
  cachedConfig = null;
}

export function bootstrapAppConfig(): AppConfig {
  resetAppConfigCache();
  const config = getAppConfig();
  validateAppConfig(config);
  return config;
}
