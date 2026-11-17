import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { recordRequest } from '../console/metrics';

/**
 * Adapter HTTP Fastify (menggantikan Express, 2026-11-16; selaras `stack.md`). Opsi mempertahankan perilaku routing Express:
 * garis miring akhir & huruf besar/kecil pada path tidak dibedakan (kontrak ke gateway/UI tidak berubah).
 * Dipakai bersama oleh main.ts dan tes e2e supaya keduanya menjalankan konfigurasi yang SAMA.
 */
export const fastifyAdapter = () => new FastifyAdapter({ routerOptions: { ignoreTrailingSlash: true, caseSensitive: false } });

/**
 * Header keamanan dasar dari API ITU SENDIRI (bukan hanya dari gateway): perilaku sama di Traefik (Compose), ingress-nginx (Kubernetes), atau tanpa gateway.
 * Hanya header yang aman untuk respons JSON/lampiran; CSP tidak dipasang di sini (UI statis disajikan nginx terpisah).
 */
function securityHeaders(_req: FastifyRequest, reply: FastifyReply, done: () => void) {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  done();
}

/**
 * Hook tingkat Fastify (bukan middleware Nest): `routeOptions.url` = pola rute (kardinalitas rendah untuk metrik) dan hook `onRequest`/`onResponse`
 * ikut mencakup permintaan yang ditolak guard (401) serta rute tak dikenal (404). Dipasang dari OnModuleInit modul layanan (sebelum `ready()`).
 */
export function installFastifyHooks(app: FastifyInstance) {
  // Express menerima body kosong ber-Content-Type JSON sebagai {} (aksi POST tanpa muatan); Fastify bawaan menolak 400 → pertahankan perilaku lama.
  // JSON rusak tetap 400 (galat ProblemFilter).
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (body === '' || body === undefined) return done(null, {});
    try { done(null, JSON.parse(body as string)); } catch (e) { (e as any).statusCode = 400; done(e as Error, undefined); }
  });
  app.addHook('onRequest', securityHeaders);
  app.addHook('onRequest', (req, _reply, done) => { (req as any)._t0 = performance.now(); done(); });
  app.addHook('onResponse', (req, reply, done) => {   // status final setelah filter galat (SQLSTATE→4xx dst.)
    const t0: number = (req as any)._t0 ?? performance.now();
    recordRequest(req.method, req.url.split('?')[0], req.routeOptions?.url ?? 'unmatched', reply.statusCode, performance.now() - t0);
    done();
  });
}
