import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadConfig } from './config';

async function bootstrap() {
  const cfg = loadConfig();
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  if (cfg.corsOrigins.length) {
    app.enableCors({
      origin: cfg.corsOrigins,
      allowedHeaders: ['Authorization', 'Content-Type', 'If-Match'],
      exposedHeaders: ['ETag'],
    });
  }
  await app.listen(cfg.port);
  console.log(`EAP API mendengarkan di :${cfg.port}`);
}
bootstrap();
