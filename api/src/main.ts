import { telemetryEnabled } from './telemetry';   // HARUS pertama (instrumentasi http/express/pg)
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { appModuleFor, SERVICE_NAMES, ServiceName } from './app.module';
import { loadConfig } from './config';

async function bootstrap() {
  const cfg = loadConfig();
  const service = (process.env.SERVICE ?? 'all') as ServiceName;
  if (!SERVICE_NAMES.includes(service)) throw new Error(`SERVICE tidak dikenal: "${service}" (pilihan: ${SERVICE_NAMES.join(', ')})`);
  const app = await NestFactory.create(appModuleFor(service));
  app.enableShutdownHooks();
  if (cfg.corsOrigins.length) {
    app.enableCors({
      origin: cfg.corsOrigins,
      allowedHeaders: ['Authorization', 'Content-Type', 'If-Match'],
      exposedHeaders: ['ETag'],
    });
  }
  await app.listen(cfg.port);
  console.log(`EAP API [${service}] mendengarkan di :${cfg.port}${telemetryEnabled ? ' · OpenTelemetry aktif' : ''}`);
}
bootstrap();
