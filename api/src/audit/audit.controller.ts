import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { pageLimit, uuidOr400 } from '../common/http';
import { DbService } from '../db/db.service';

/** Log audit append-only (SET-05). Dibaca sebagai peran DB eap_audit — satu-satunya dengan SELECT; tidak berisi PII (D-14). */
@Controller('api/v1/audit')
export class AuditController {
  constructor(private readonly db: DbService) {}

  @Get('logs') @RequirePermission('set.audit.read')
  logs(@CurrentUser() p: Principal, @Query() q: Record<string, string>) {
    const limit = pageLimit(q.limit);
    return this.db.audit(p, async (c) => {
      const w: string[] = []; const a: unknown[] = [];
      const add = (sql: string, v: unknown) => { a.push(v); w.push(sql.replace(/\?/g, `$${a.length}`)); };
      if (q.tableName) add('table_name = ?', q.tableName);
      if (q.tableSchema) add('table_schema = ?', q.tableSchema);
      if (q.recordId) add('record_id = ?', uuidOr400(q.recordId, 'recordId'));
      if (q.changedBy) add('changed_by = ?', uuidOr400(q.changedBy, 'changedBy'));
      if (q.action) add('action = ?', q.action);
      for (const [k, op] of [['from', '>='], ['to', '<']] as const) {
        if (q[k]) { if (Number.isNaN(Date.parse(q[k]))) throw new BadRequestException(`${k} harus tanggal/waktu ISO`); add(`changed_at ${op} ?::timestamptz`, q[k]); }
      }
      if (q.cursor) { if (!/^\d+$/.test(q.cursor)) throw new BadRequestException('cursor tidak valid'); add('id < ?', q.cursor); }
      a.push(limit + 1);
      const rows = (await c.query(
        `SELECT id, table_schema, table_name, record_id, action, changed_by, changed_at, old_values, new_values, correlation_id
           FROM shared.audit_logs ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY id DESC LIMIT $${a.length}`, a)).rows;
      const more = rows.length > limit; const data = more ? rows.slice(0, limit) : rows;
      return { data, nextCursor: more ? String(data[data.length - 1].id) : null };
    });
  }
}
