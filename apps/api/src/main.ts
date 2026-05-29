import './instrument';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { StructuredLogger } from './common/structured-logger.service';
import { ApiExceptionFilter } from './common/http-exception.filter';
import { getAllowedCorsOrigins } from './common/api-config';
import { RateLimitGuard } from './common/rate-limit.guard';

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath?: string,
): Array<{ field: string; message: string }> {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const ownErrors = error.constraints
      ? Object.values(error.constraints).map((message) => ({
          field,
          message,
        }))
      : [];
    const childErrors = error.children?.length
      ? flattenValidationErrors(error.children, field)
      : [];
    return [...ownErrors, ...childErrors];
  });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === 'production' ? new StructuredLogger() : undefined,
  });
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
