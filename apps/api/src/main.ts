import './instrument';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { StructuredLogger } from './common/structured-logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === 'production' ? new StructuredLogger() : undefined,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  const port = process.env.PORT ?? 4000;

  const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Clinic-Id'],
  });

  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
}
void bootstrap();
