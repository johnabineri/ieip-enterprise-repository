import { telemetryEnabled } from './telemetry';   // HARUS pertama (instrumentasi http/fastify/pg)
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { fastifyAdapter } from './common/fastify';
import { appModuleFor, SERVICE_NAMES, ServiceName } from './app.module';
import { loadConfig } from './config';

async function bootstrap() {
  const cfg = loadConfig();
  const service = (process.env.SERVICE ?? 'all') as ServiceName;
  if (!SERVICE_NAMES.includes(service)) throw new Error(`SERVICE tidak dikenal: "${service}" (pilihan: ${SERVICE_NAMES.join(', ')})`);
  const app = await NestFactory.create<NestFastifyApplication>(appModuleFor(service), fastifyAdapter());
  app.enableShutdownHooks();
  if (cfg.corsOrigins.length) {
    app.enableCors({
      origin: cfg.corsOrigins,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],   // default @fastify/cors hanya GET/HEAD/POST (Express: semua)
      allowedHeaders: ['Authorization', 'Content-Type', 'If-Match'],
      exposedHeaders: ['ETag'],
    });
  }
  await app.listen(cfg.port, '0.0.0.0');
  console.log(`EAP API [${service}] mendengarkan di :${cfg.port}${telemetryEnabled ? ' · OpenTelemetry aktif' : ''}`);
}
bootstrap();
