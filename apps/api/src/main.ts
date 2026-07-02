import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger, RawBodyRequest, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters';

const processLogger = new Logger('Process');

// Een rejection buiten de request-context (cron job, fire-and-forget promise)
// mag het proces niet neerhalen; een uncaughtException laat het proces wél
// gecontroleerd stoppen zodat de procesmanager met een schone staat herstart.
process.on('unhandledRejection', (reason) => {
  processLogger.error(
    'Unhandled promise rejection',
    reason instanceof Error ? reason.stack : String(reason),
  );
});

process.on('uncaughtException', (error) => {
  processLogger.error('Uncaught exception, shutting down', error.stack);
  process.exit(1);
});

async function bootstrap() {
  // We registreren de body-parsers hieronder zelf (bodyParser: false) zodat we per
  // route gedifferentieerde limieten kunnen zetten. De default Nest/Express-limiet
  // van 100 kB is te krap voor realistische v3-sync-pushes (honderden entiteiten +
  // base64) → die liepen op 413. Sync krijgt 10 MB, de rest een strakke 1 MB.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  // Vang de ruwe request-body op voor webhook-signature-verificatie. Nest's eigen
  // `rawBody: true` vervalt met `bodyParser: false`, dus doen we het hier via de
  // body-parser `verify`-hook (draait vóór het JSON-parsen).
  const captureRawBody = (req: Request, _res: Response, buf: Buffer): void => {
    if (buf?.length) {
      (req as RawBodyRequest<Request>).rawBody = buf;
    }
  };

  // Route-specifieke limiet gaat vóór de generieke; body-parser slaat de tweede
  // parser over zodra `req._body` gezet is, dus /api/v1/sync houdt de 10 MB-limiet.
  app.use('/api/v1/sync', json({ limit: '10mb', verify: captureRawBody }));
  app.use(json({ limit: '1mb', verify: captureRawBody }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  const baseDomain = process.env.BASE_DOMAIN || 'localhost';
  const portalPort = process.env.PORTAL_PORT || '5173';
  const isLocalhost = baseDomain === 'localhost';

  // Trust proxy: in productie staat de API achter precies één reverse proxy.
  // 'trust proxy = 1' laat Express X-Forwarded-Host/-For/-Proto van die proxy
  // gebruiken voor req.hostname (tenant-resolutie!) en req.ip (rate limiting),
  // maar negeert door clients meegestuurde extra headers. Lokaal (geen proxy)
  // expliciet uit, zodat een client de tenant-hostname niet kan spoofen.
  app.set('trust proxy', isLocalhost ? false : 1);

  // Cookie parser
  app.use(cookieParser());

  // CORS — allow all subdomains of BASE_DOMAIN (Beheer-portal) plus, optioneel, een los
  // client-portal-basisdomein (Fase 6). In dev draait de client-portal op een subdomein van
  // BASE_DOMAIN (bijv. inspexidemo.localhost:5174) en valt dus al onder de eerste check;
  // CLIENT_PORTAL_BASE_DOMAIN is voor een prod-deploy op een eigen domein.
  const protocol = isLocalhost ? 'http' : 'https';
  const portSuffix = isLocalhost ? `:${portalPort}` : '';
  const clientPortalBaseDomain = process.env.CLIENT_PORTAL_BASE_DOMAIN?.trim() || null;

  const isAllowedHost = (hostname: string): boolean => {
    if (hostname === baseDomain || hostname.endsWith(`.${baseDomain}`)) return true;
    if (
      clientPortalBaseDomain &&
      (hostname === clientPortalBaseDomain || hostname.endsWith(`.${clientPortalBaseDomain}`))
    ) {
      return true;
    }
    return false;
  };

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (server-to-server, Postman, etc.)
      if (!origin) {
        callback(null, true);
        return;
      }
      try {
        const url = new URL(origin);
        if (isAllowedHost(url.hostname)) {
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
