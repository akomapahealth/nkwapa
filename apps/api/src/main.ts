import './instrument';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { SYNC_PUSH_MAX_BODY_SIZE } from './sync/sync.controller';
import { StructuredLogger } from './common/structured-logger.service';
import { flattenValidationErrors } from './common/validation';
import { ApiExceptionFilter } from './common/http-exception.filter';
import { getAllowedCorsOrigins } from './common/api-config';
import { RateLimitGuard } from './common/rate-limit.guard';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: process.env.NODE_ENV === 'production' ? new StructuredLogger() : undefined,
  });
  // Express defaults to 100 KB, which a full offline batch can exceed. The two limits are set
  // together so a client that respects SYNC_PUSH_MAX_MUTATIONS is never rejected by the body
  // parser with an error it cannot act on.
  app.useBodyParser('json', { limit: SYNC_PUSH_MAX_BODY_SIZE });
  const httpAdapter = app.getHttpAdapter();
  const adapterInstance = httpAdapter.getInstance?.() as {
    disable?: (setting: string) => void;
  };
  adapterInstance?.disable?.('x-powered-by');
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalGuards(app.get(RateLimitGuard));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors) =>
        new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed.',
          fieldErrors: flattenValidationErrors(errors),
          recoveryAction: 'Review the request fields and try again.',
        }),
    }),
  );
  const port = process.env.PORT ?? 4000;

  const allowedOrigins = getAllowedCorsOrigins();
  app.enableCors({
    origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Clinic-Id',
      'X-Request-Id',
      'X-Correlation-Id',
    ],
    exposedHeaders: ['X-Request-Id', 'X-Correlation-Id'],
  });

  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
}
void bootstrap();
