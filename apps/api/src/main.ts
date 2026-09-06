import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { getRootEnvPath } from './config/env-path';

const envPath = getRootEnvPath();
const result = config({ path: envPath });

if (result.error && !process.env.DATABASE_URL) {
  console.warn(`[env] Could not load ${envPath}: ${result.error.message}`);
} else if (process.env.DATABASE_URL) {
  console.log(`[env] Loaded DATABASE_URL from ${envPath}`);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173').split(','),
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = parseInt(process.env.API_PORT ?? '3000', 10);
  const host = process.env.API_HOST ?? '0.0.0.0';

  await app.listen(port, host);
  console.log(`Fratelanza ERP API running on http://${host}:${port}/api/v1`);
}

void bootstrap();
