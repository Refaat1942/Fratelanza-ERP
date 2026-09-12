import { resolveAppVersion, resolveDesktopVersion } from './version';

export interface ApiConfig {
  port: number;
  host: string;
  corsOrigins: string[];
}

export interface DatabaseConfig {
  url: string;
}

export interface JwtConfig {
  secret: string;
  accessExpiresIn: string;
  refreshExpiresIn: string;
}

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  api: ApiConfig;
  database: DatabaseConfig;
  jwt: JwtConfig;
  syncEnabled: boolean;
  partyLegacyRoutingEnabled: boolean;
  purchasingPartyRoutingEnabled: boolean;
  universalFinancePilotEnabled: boolean;
  universalFinanceSalesPilotEnabled: boolean;
  appVersion: string;
  appUrl: string;
  frontendUrl: string;
}

const DEV_JWT_FALLBACK = 'development-secret-change-in-production';

export { resolveAppVersion, resolveDesktopVersion };

export function loadApiConfig(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as AppConfig['nodeEnv'];
  const appUrl = process.env.APP_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:5174';
  const frontendUrl = process.env.FRONTEND_URL ?? appUrl;
  const defaultCors = `${frontendUrl},http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174`;

  return {
    nodeEnv,
    api: {
      port: parseInt(process.env.API_PORT ?? '3000', 10),
      host: process.env.API_HOST ?? '0.0.0.0',
      corsOrigins: (process.env.CORS_ORIGINS ?? defaultCors).split(',').map((s) => s.trim()),
    },
    database: {
      url: process.env.DATABASE_URL ?? '',
    },
    jwt: {
      secret: process.env.JWT_SECRET ?? DEV_JWT_FALLBACK,
      accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    },
    syncEnabled: process.env.SYNC_ENABLED === 'true',
    partyLegacyRoutingEnabled: process.env.PARTY_LEGACY_ROUTING_ENABLED === 'true',
    purchasingPartyRoutingEnabled: process.env.PURCHASING_PARTY_ROUTING_ENABLED === 'true',
    universalFinancePilotEnabled: process.env.UNIVERSAL_FINANCE_PILOT_ENABLED === 'true',
    universalFinanceSalesPilotEnabled: process.env.UNIVERSAL_FINANCE_SALES_PILOT_ENABLED === 'true',
    appVersion: resolveAppVersion(),
    appUrl,
    frontendUrl,
  };
}

export function validateAppConfig(config: AppConfig = loadApiConfig()): void {
  const errors: string[] = [];

  if (!config.database.url) {
    errors.push('DATABASE_URL is required');
  }

  if (config.nodeEnv === 'production' || config.nodeEnv === 'test') {
    if (!process.env.JWT_SECRET || config.jwt.secret === DEV_JWT_FALLBACK) {
      errors.push('JWT_SECRET must be set to a strong value in production/test');
    }
    if (config.jwt.secret.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters in production/test');
    }
  }

  if (config.nodeEnv === 'production') {
    if (config.jwt.secret.includes('change-this') || config.jwt.secret.includes('dev')) {
      errors.push('JWT_SECRET appears to be a placeholder — set a unique production secret');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid application configuration:\n- ${errors.join('\n- ')}`);
  }
}

export function getJwtSecret(config: AppConfig = loadApiConfig()): string {
  validateAppConfig(config);
  return config.jwt.secret;
}
