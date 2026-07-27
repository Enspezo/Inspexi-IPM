import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger, RawBodyRequest, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters';
import { validateJwtSecrets } from './common/config/validate-jwt-secrets';

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
  // Fail-fast: weiger te starten met ontbrekende/default/gedeelde JWT-secrets
  // (vóór het opzetten van de Nest-app, zodat een misconfiguratie meteen stopt).
  validateJwtSecrets(process.env, process.env.NODE_ENV);

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

  // Routes die legitiem grote payloads dragen krijgen een ruime limiet; de rest een
  // strakke 1 MB. Een route-specifieke parser draait vóór de generieke en zet
  // `req._body`, waardoor body-parser de generieke parser overslaat — dus de ruime
  // limiet blijft gelden.
  //   • /sync            → v3-sync-pushes (honderden entiteiten + base64)
  //   • generated-documents / signature-requests / client/documents
  //                      → base64-handtekeningen (~MB's) + bewerkte rapport-HTML;
  //                        met 1 MB zouden ondertekenen/rapport-bewerken op 413 lopen.
  const LARGE_BODY_PREFIXES = [
    '/api/v1/sync',
    '/api/v1/generated-documents',
    '/api/v1/signature-requests',
    '/api/v1/client/documents',
  ];
  for (const prefix of LARGE_BODY_PREFIXES) {
    app.use(prefix, json({ limit: '10mb', verify: captureRawBody }));
  }
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

  // Beveiligingsheaders (WP-B4 / B-507) — platformbreed vangnet naast de
  // route-specifieke headers op de bestandsroutes (logo, avatar, documenten).
  //
  // • CSP: deze applicatie serveert JSON, binaire bestanden en een paar kleine
  //   HTML-pagina's (afmeldbevestiging, template-previews). `default-src 'none'`
  //   is het vangnet: er valt geen script uit te voeren wanneer zo'n respons als
  //   document geopend wordt — precies het escalatiepad uit B-507. `style-src`/
  //   `img-src` staan wél open zodat die HTML-pagina's leesbaar blijven; er is
  //   géén `script-src`, dus die valt terug op `default-src 'none'`.
  //   Swagger UI heeft eigen scripts nodig en krijgt hieronder een eigen policy.
  // • CORP: de portal (:5173) en het klantportaal (:5174) laden logo's van de
  //   API met een `<img>`. helmet's default `same-origin` zou die loads blokkeren
  //   zodra API en portal niet exact hetzelfde origin delen, dus expliciet
  //   `cross-origin`. Dit verandert niets aan CORS (credentials blijven via de
  //   bestaande origin-functie geregeld).
  // • HSTS laten we aan helmet over, maar niet op localhost: een Strict-Transport-
  //   Security-header op http://…localhost zou de dev-portals naar https duwen.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // COEP zou cross-origin subresources zonder CORP-opt-in blokkeren; die
      // isolatie hebben we niet nodig en helmet zet hem standaard ook niet aan.
      crossOriginEmbedderPolicy: false,
      hsts: isLocalhost ? false : undefined,
    }),
  );

  // Swagger UI laadt eigen scripts/styles (deels inline) vanaf hetzelfde origin.
  // Die pagina krijgt daarom een eigen CSP; hij draait ná de globale helmet, dus
  // deze header overschrijft de strikte variant hierboven voor /api/docs.
  app.use('/api/docs', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
      ].join('; '),
    );
    next();
  });

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

  // Run OnModuleDestroy hooks (Prisma $disconnect, Puppeteer browser close) on
  // SIGTERM/SIGINT so redeploys shut down cleanly (DEP-10).
  app.enableShutdownHooks();

  // Swagger — publishes the full API surface unauthenticated, so keep it OFF in
  // production unless SWAGGER_ENABLED=true is set explicitly. Non-production keeps
  // it on by default (DEP-9 / SEC-15).
  const enableSwagger =
    process.env.SWAGGER_ENABLED !== undefined
      ? process.env.SWAGGER_ENABLED === 'true'
      : process.env.NODE_ENV !== 'production';
  if (enableSwagger) {
    const config = new DocumentBuilder()
      .setTitle('InspeXi Beheer API')
      .setDescription('Inspectie Management Platform — REST API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.API_PORT || 3000;
  await app.listen(port);
  console.log(`🚀 API running on http://localhost:${port}/api/v1`);
  if (enableSwagger) {
    console.log(`📚 Swagger docs at http://localhost:${port}/api/docs`);
  }
}
bootstrap();
