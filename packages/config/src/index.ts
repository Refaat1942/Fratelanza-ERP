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
}

export function loadApiConfig(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as AppConfig['nodeEnv'];

  return {
    nodeEnv,
    api: {
      port: parseInt(process.env.API_PORT ?? '3000', 10),
      host: process.env.API_HOST ?? '0.0.0.0',
      corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(','),
    },
    database: {
      url: process.env.DATABASE_URL ?? '',
    },
    jwt: {
      secret: process.env.JWT_SECRET ?? 'development-secret-change-in-production',
      accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    },
  };
}
