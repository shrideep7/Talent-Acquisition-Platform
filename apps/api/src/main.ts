import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: (process.env.API_CORS_ORIGIN ?? 'http://localhost:3000').split(','),
    credentials: true,
  });
  app.use(json({ limit: '5mb' }));
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
