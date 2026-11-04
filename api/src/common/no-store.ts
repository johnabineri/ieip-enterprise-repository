import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Semua respons API bersifat per-pengguna dan dapat memuat data pribadi: tidak boleh disimpan cache peramban/proxy.
 * Juga mencegah 304 palsu: ETag detail party = row_version party, padahal isinya memuat anak (identitas, peran)
 * yang bisa berubah tanpa menaikkan versi induk.
 */
@Injectable()
export class NoStoreInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = ctx.switchToHttp().getResponse();
    if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store');
    return next.handle();
  }
}
