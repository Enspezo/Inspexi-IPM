import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

const PLACEHOLDER_KEYS = new Set(['change-me-in-production', 'dev-convert-secret']);

/**
 * Fail fast on a missing or placeholder shared secret outside development.
 * The main API sends this key as `x-api-key`; a placeholder in staging or
 * production would let anyone on the network use the converter.
 */
function assertApiKeyConfigured(): void {
  const key = process.env.CONVERT_API_KEY ?? '';
  const isProdLike = process.env.NODE_ENV === 'production';
  if (!isProdLike) return;
  if (!key || key.length < 16 || PLACEHOLDER_KEYS.has(key)) {
    throw new Error(
      'CONVERT_API_KEY must be set to a unique secret of at least 16 characters when NODE_ENV=production',
    );
  }
}

async function bootstrap() {
  assertApiKeyConfigured();

  const app = await NestFactory.create(AppModule);

  // Allow requests from the main API
  app.enableCors();
  app.enableShutdownHooks();

  // CONVERT_API_PORT is the explicit setting; PORT is what most PaaS
  // platforms (Railway, Render, Fly) inject.
  const port = process.env.CONVERT_API_PORT || process.env.PORT || 3002;
  await app.listen(port);
  Logger.log(`Convert API running on http://localhost:${port}`, 'Bootstrap');
}
bootstrap();
