/**
 * Header keamanan dasar dari API ITU SENDIRI (bukan hanya dari gateway): perilaku sama di Traefik (Compose), ingress-nginx (Kubernetes), atau tanpa gateway.
 * Hanya header yang aman untuk respons JSON/lampiran; CSP tidak dipasang di sini (UI statis disajikan nginx terpisah).
 */
export function securityHeaders(_req: unknown, res: { setHeader(k: string, v: string): void; removeHeader(k: string): void }, next: () => void) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.removeHeader('X-Powered-By');
  next();
}
