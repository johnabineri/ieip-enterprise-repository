import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/auth';
import { DbService } from '../db/db.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DbService) {}
  @Public() @Get() live() { return { status: 'ok' }; }
  @Public() @Get('ready')
  async ready() {
    try { await this.db.pool.query('SELECT 1'); } catch { throw new ServiceUnavailableException('database tidak tersedia'); }
    return { status: 'ready' };
  }
}
