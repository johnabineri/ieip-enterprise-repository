import { Global, Module } from '@nestjs/common';
import { loadConfig } from '../config';
import { APP_CONFIG, DbService } from './db.service';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }, DbService],
  exports: [APP_CONFIG, DbService],
})
export class DbModule {}
