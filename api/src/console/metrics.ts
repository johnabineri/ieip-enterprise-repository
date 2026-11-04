import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

interface Route { count: number; errors: number; durs: number[] }
const MAX = 2000;
const started = Date.now();
const routes = new Map<string, Route>();
let total = 0, errors5xx = 0;
const all: number[] = [];

const push = (arr: number[], v: number) => { arr.push(v); if (arr.length > MAX) arr.shift(); };
const pct = (a: number[], p: number) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] * 10) / 10; };

/** Metrik latensi/galat NYATA proses API ini (in-memory sejak start; tidak lintas replika). Bukan pengganti OpenTelemetry/Prometheus. */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest(); const res = ctx.switchToHttp().getResponse(); const t0 = performance.now();
    const rec = (status: number) => {
      const ms = performance.now() - t0; const key = `${req.method} ${req.route?.path ?? req.path}`;
      if (key.includes('/health')) return;
      const r = routes.get(key) ?? { count: 0, errors: 0, durs: [] }; routes.set(key, r);
      r.count++; total++; push(r.durs, ms); push(all, ms);
      if (status >= 500) { r.errors++; errors5xx++; }
    };
    res.once('finish', () => rec(res.statusCode));   // status final setelah filter galat (SQLSTATE→4xx dst.)
    return next.handle();
  }
}

export function snapshot() {
  const top = [...routes.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8).map(([route, r]) => ({ route, count: r.count, errors: r.errors, p95Ms: pct(r.durs, 95) }));
  return {
    uptimeS: Math.round((Date.now() - started) / 1000), startedAt: new Date(started).toISOString(), requests: total, errors5xx,
    errorRate: total ? Math.round((errors5xx / total) * 100000) / 1000 : 0, p50Ms: pct(all, 50), p95Ms: pct(all, 95), p99Ms: pct(all, 99), top,
  };
}
