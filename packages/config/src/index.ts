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

export interface LicenseConfig {
  /** Ed25519 public key (PEM) shipped to customer installations for offline verification */
  verificationPublicKey: string | null;
  /** Issuance private key — Fratelanza licensing authority / test only. NEVER ship to customers */
  signingPrivateKey: string | null;
  /** Local development only — disables signature enforcement (never use in production) */
  allowUnsignedDev: boolean;
}

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  api: ApiConfig;
  database: DatabaseConfig;
  jwt: JwtConfig;
  syncEnabled: boolean;
  /** When true, Sales may resolve Party → Customer via legacy adapter. Disabled by default. */
  partyLegacyRoutingEnabled: boolean;
  /** When true, Purchasing may resolve Party → Supplier via legacy adapter. Disabled by default. */
  purchasingPartyRoutingEnabled: boolean;
  /** When true, PO receive posts via FinancialPostingService (Phase 8.2 pilot). Default false. */
  universalFinancePilotEnabled: boolean;
  /** When true, Sales invoice post uses FinancialPostingService (Phase 8.3 pilot). Default false. */
  universalFinanceSalesPilotEnabled: boolean;
  license: LicenseConfig;
}

const DEV_JWT_FALLBACK = 'development-secret-change-in-production';

export function loadApiConfig(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as AppConfig['nodeEnv'];

  return {
    nodeEnv,
    api: {
      port: parseInt(process.env.API_PORT ?? '3000', 10),
      host: process.env.API_HOST ?? '0.0.0.0',
      corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173').split(','),
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
    license: {
      verificationPublicKey: process.env.LICENSE_VERIFICATION_PUBLIC_KEY ?? null,
      signingPrivateKey: process.env.LICENSE_SIGNING_PRIVATE_KEY ?? null,
      allowUnsignedDev: process.env.LICENSE_ALLOW_UNSIGNED_DEV === 'true',
    },
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

  if (errors.length > 0) {
    throw new Error(`Invalid application configuration:\n- ${errors.join('\n- ')}`);
  }
}

export function getJwtSecret(config: AppConfig = loadApiConfig()): string {
  validateAppConfig(config);
  return config.jwt.secret;
}
