import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { getRootEnvPath } from './config/env-path';
import { bootstrapAppConfig } from './config/app-config';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

const envPath = getRootEnvPath();
const result = config({ path: envPath });

if (result.error && !process.env.DATABASE_URL) {
  console.warn(`[env] Could not load ${envPath}: ${result.error.message}`);
} else if (process.env.DATABASE_URL) {
  console.log(`[env] Loaded DATABASE_URL from ${envPath}`);
}

async function bootstrap() {
  const appConfig = bootstrapAppConfig();
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.enableCors({
    origin: appConfig.api.corsOrigins,
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.listen(appConfig.api.port, appConfig.api.host);
  logger.log(`API running on http://${appConfig.api.host}:${appConfig.api.port}/api/v1`);
  logger.log(`Sync engine: ${appConfig.syncEnabled ? 'enabled' : 'disabled (LAN MVP mode)'}`);
}

void bootstrap();
