import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../auth/auth';
import { DbService } from '../db/db.service';

interface Route { count: number; errors: number; durs: number[] }
const MAX = 2000;
const started = Date.now();
const routes = new Map<string, Route>();
let total = 0, errors5xx = 0;
const all: number[] = [];

// ---- registri Prometheus (histogram latensi + counter per layanan/metode/rute/status); kardinalitas rendah: rute = pola Express, tak cocok = "unmatched" ----
const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
interface Prom { count: number; sum: number; buckets: number[] }
const prom = new Map<string, Prom>();
const promKey = (method: string, route: string, status: number) => `${method}\u0001${route}\u0001${status}`;
const SERVICE = () => process.env.SERVICE ?? 'all';

const push = (arr: number[], v: number) => { arr.push(v); if (arr.length > MAX) arr.shift(); };
const pct = (a: number[], p: number) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] * 10) / 10; };

/**
 * Metrik latensi/galat NYATA proses ini (in-memory sejak start; per replika) + registri Prometheus untuk /metrics.
 * Dipasang sebagai MIDDLEWARE (bukan interceptor) agar permintaan yang ditolak guard autentikasi (401) dan rute tak dikenal (404) ikut terhitung.
 */
export function metricsMiddleware(req: any, res: any, next: () => void) {
  const t0 = performance.now();
  res.once('finish', () => {                       // status final setelah filter galat (SQLSTATE→4xx dst.); req.route terisi setelah routing
    const path: string = req.originalUrl?.split('?')[0] ?? req.path ?? '';
    if (path === '/metrics' || path.startsWith('/health')) return;
    const ms = performance.now() - t0; const status: number = res.statusCode; const pattern: string = req.route?.path ?? 'unmatched';
    const key = `${req.method} ${pattern}`;
    const r = routes.get(key) ?? { count: 0, errors: 0, durs: [] }; routes.set(key, r);
    r.count++; total++; push(r.durs, ms); push(all, ms);
    if (status >= 500) { r.errors++; errors5xx++; }
    const k = promKey(req.method, pattern, status); const p = prom.get(k) ?? { count: 0, sum: 0, buckets: BUCKETS.map(() => 0) }; prom.set(k, p);
    p.count++; p.sum += ms / 1000; BUCKETS.forEach((b, i) => { if (ms / 1000 <= b) p.buckets[i]++; });
  });
  next();
}

export function snapshot() {
  const top = [...routes.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8).map(([route, r]) => ({ route, count: r.count, errors: r.errors, p95Ms: pct(r.durs, 95) }));
  return {
    uptimeS: Math.round((Date.now() - started) / 1000), startedAt: new Date(started).toISOString(), requests: total, errors5xx,
    errorRate: total ? Math.round((errors5xx / total) * 100000) / 1000 : 0, p50Ms: pct(all, 50), p95Ms: pct(all, 95), p99Ms: pct(all, 99), top,
  };
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
export function renderPrometheus(pool?: { totalCount: number; idleCount: number; waitingCount: number }): string {
  const svc = esc(SERVICE()); const L: string[] = [];
  L.push('# HELP http_requests_total Jumlah permintaan HTTP selesai.', '# TYPE http_requests_total counter');
  for (const [k, p] of prom) { const [m, r, s] = k.split('\u0001'); L.push(`http_requests_total{service="${svc}",method="${m}",route="${esc(r)}",status="${s}"} ${p.count}`); }
  L.push('# HELP http_request_duration_seconds Latensi permintaan HTTP.', '# TYPE http_request_duration_seconds histogram');
  for (const [k, p] of prom) {
    const [m, r, s] = k.split('\u0001'); const lb = `service="${svc}",method="${m}",route="${esc(r)}",status="${s}"`;
    BUCKETS.forEach((b, i) => L.push(`http_request_duration_seconds_bucket{${lb},le="${b}"} ${p.buckets[i]}`));
    L.push(`http_request_duration_seconds_bucket{${lb},le="+Inf"} ${p.count}`, `http_request_duration_seconds_sum{${lb}} ${p.sum}`, `http_request_duration_seconds_count{${lb}} ${p.count}`);
  }
  const mem = process.memoryUsage();
  L.push('# TYPE app_info gauge', `app_info{service="${svc}",node="${process.version}"} 1`,
    '# TYPE process_uptime_seconds gauge', `process_uptime_seconds{service="${svc}"} ${Math.round(process.uptime())}`,
    '# TYPE process_resident_memory_bytes gauge', `process_resident_memory_bytes{service="${svc}"} ${mem.rss}`,
    '# TYPE process_heap_used_bytes gauge', `process_heap_used_bytes{service="${svc}"} ${mem.heapUsed}`);
  if (pool) L.push('# HELP db_pool_connections Koneksi pool PostgreSQL.', '# TYPE db_pool_connections gauge',
    `db_pool_connections{service="${svc}",state="total"} ${pool.totalCount}`, `db_pool_connections{service="${svc}",state="idle"} ${pool.idleCount}`, `db_pool_connections{service="${svc}",state="waiting"} ${pool.waitingCount}`);
  return L.join('\n') + '\n';
}

/** Endpoint scrape Prometheus. TIDAK dirutekan gateway (hanya jaringan internal); tanpa data sensitif (pola rute, hitungan, latensi). */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly db: DbService) {}
  @Public() @Get() @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  scrape() { return renderPrometheus(this.db.pool); }
}
