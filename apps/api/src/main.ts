import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cookie parser
  app.use(cookieParser());

  // CORS — allow all subdomains of BASE_DOMAIN
  const baseDomain = process.env.BASE_DOMAIN || 'localhost';
  const portalPort = process.env.PORTAL_PORT || '5173';
  const isLocalhost = baseDomain === 'localhost';
  const protocol = isLocalhost ? 'http' : 'https';
  const portSuffix = isLocalhost ? `:${portalPort}` : '';

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (server-to-server, Postman, etc.)
      if (!origin) {
        callback(null, true);
        return;
      }
      try {
        const url = new URL(origin);
        const hostname = url.hostname;
        // Allow exact base domain or any subdomain of base domain
        if (hostname === baseDomain || hostname.endsWith(`.${baseDomain}`)) {
          callback(null, true);
          return;
        }
      } catch {
        // Invalid origin URL
      }
      callback(null, false);
    },
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('InspeXi Beheer API')
    .setDescription('Inspectie Management Platform — REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.API_PORT || 3000;
  await app.listen(port);
  console.log(`🚀 API running on http://localhost:${port}/api/v1`);
  console.log(`📚 Swagger docs at http://localhost:${port}/api/docs`);
}
bootstrap();
