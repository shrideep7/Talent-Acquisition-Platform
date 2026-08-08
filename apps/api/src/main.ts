import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

/** localhost/127.0.0.1 and RFC-1918 private ranges, on any port. */
const PRIVATE_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

/**
 * Allowed browser origins.
 *
 * API_CORS_ORIGIN takes a comma-separated list (whitespace around entries is
 * ignored), or "*" to allow any origin. When it is unset — the usual case for
 * a LAN deployment — localhost and private-network addresses are allowed on
 * any port, so the app keeps working when the host machine's IP changes
 * without anyone editing config. Public origins are never allowed implicitly.
 */
function corsOrigin() {
  const configured = process.env.API_CORS_ORIGIN?.trim();
  if (configured === '*') return true;
  if (configured) {
    const allowed = configured
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean);
    if (allowed.length > 0) return allowed;
  }
  return (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // No Origin header (curl, server-to-server, same-origin) — nothing to block.
    if (!origin) return callback(null, true);
    callback(null, PRIVATE_ORIGIN.test(origin));
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: corsOrigin(), credentials: true });
  app.use(
    json({
      limit: '5mb',
      // Keep the raw bytes so webhook signatures (X-Hub-Signature-256) can be
      // verified against exactly what the sender signed.
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: '5mb' }));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: false }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('MFD Talent Acquisition Tool API')
    .setDescription(
      'JD–CV match analysis, ATS-optimized CV generation, interview prep, and candidate sourcing',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = parseInt(process.env.API_PORT ?? '4000', 10);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`MFD TAT API listening on :${port} — OpenAPI docs at /docs`);
}

bootstrap();
