import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';

const BASE = 'https://eap.kalla.id/errors/';

/** Galat domain dengan field tambahan (RFC 9457 extension members), mis. existing_party_id. */
export class ProblemException extends HttpException {
  constructor(status: number, slug: string, title: string, detail?: string, extra: Record<string, unknown> = {}) {
    super({ type: BASE + slug, title, status, detail, ...extra }, status);
  }
}

// SQLSTATE -> (status, slug, title). Pesan RAISE EXCEPTION dari trigger/fungsi DB adalah aturan bisnis yang disengaja.
const PG: Record<string, [number, string, string]> = {
  '23505': [409, 'conflict', 'Data bentrok dengan data yang sudah ada'],
  '23503': [409, 'reference-violation', 'Rujukan data tidak valid'],
  '23514': [422, 'validation-failed', 'Data melanggar aturan'],
  '23502': [422, 'validation-failed', 'Kolom wajib kosong'],
  '22P02': [400, 'bad-request', 'Format nilai tidak valid'],
  '22023': [400, 'bad-request', 'Parameter tidak valid'],
  '22007': [400, 'bad-request', 'Format tanggal tidak valid'],
  '42501': [403, 'forbidden', 'Akses ditolak'],
  'P0001': [422, 'business-rule', 'Aturan bisnis dilanggar'],
  'P0002': [404, 'not-found', 'Data tidak ditemukan'],
};

@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly log = new Logger('Problem');

  catch(e: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();
    const instance = req.originalUrl?.split('?')[0];
    let body: Record<string, unknown>;

    if (e instanceof HttpException) {
      const r = e.getResponse();
      const status = e.getStatus();
      if (typeof r === 'object' && r && 'type' in r) {
        body = { ...(r as object), instance };
      } else {
        const msg = typeof r === 'string' ? r : (r as any).message;
        const detail = Array.isArray(msg) ? msg.join('; ') : msg;
        body = { type: BASE + slugOf(status), title: HttpStatus[status] ?? 'Error', status, detail, instance };
      }
    } else if (typeof (e as any)?.code === 'string' && PG[(e as any).code]) {
      const [status, slug, title] = PG[(e as any).code];
      body = { type: BASE + slug, title, status, detail: (e as any).message, instance };
    } else {
      this.log.error(e instanceof Error ? e.stack : String(e));
      body = { type: BASE + 'internal', title: 'Kesalahan internal', status: 500, instance };
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(body.status as number).type('application/problem+json').send(body);
  }
}

function slugOf(status: number): string {
  return ({ 400: 'bad-request', 401: 'unauthorized', 403: 'forbidden', 404: 'not-found', 409: 'conflict',
    412: 'precondition-failed', 422: 'validation-failed', 428: 'precondition-required' } as Record<number, string>)[status] ?? 'error';
}
