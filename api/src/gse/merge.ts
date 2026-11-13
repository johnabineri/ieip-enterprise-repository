/**
 * Penggabungan 3-arah berbasis baris (GSE-05 editor kode) — tanpa dependensi.
 *   dasar  = isi pada revisi tempat penyunting mulai (baseRevision)
 *   mine   = isi yang dikirim penyunting
 *   theirs = isi revisi terbaru di server (didahului penyunting lain)
 * Algoritma: LCS baris (diff Myers, dengan pemangkasan awalan/akhiran bersama) dasar↔mine dan dasar↔theirs, lalu diff3 klasik:
 * baris dasar yang cocok di KEDUA sisi = titik sinkron; di antara titik sinkron, bila hanya satu sisi berubah ambil sisi itu, bila keduanya
 * berubah sama ambil salah satu, selain itu KONFLIK (ditandai gaya git diff3: <<<<<<< / ||||||| / ======= / >>>>>>>).
 * Pemisahan baris memakai '\n' saja sehingga isi (termasuk \r dan baris terakhir tanpa newline) kembali utuh byte-per-byte.
 */
export interface MergeResult { clean: boolean; content: string; conflicts: number }
export const MARK = { mine: '<<<<<<< milik Anda', base: '||||||| dasar', sep: '=======', theirs: '>>>>>>> terbaru' };
/** Batas kerja diff (baris yang BERBEDA setelah pemangkasan × jarak edit) — di atasnya penggabungan otomatis tidak dicoba. */
export const MERGE_LIMITS = { maxLines: 20_000, maxEditDistance: 2_000 };

/** Pasangan indeks baris yang cocok (LCS) antara a dan b, menaik. null bila melebihi batas kerja. */
export function lcsPairs(a: string[], b: string[]): Array<[number, number]> | null {
  let pre = 0; while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0; while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const A = a.slice(pre, a.length - suf); const B = b.slice(pre, b.length - suf);
  if (A.length + B.length > MERGE_LIMITS.maxLines) return null;
  const mid = myers(A, B); if (!mid) return null;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < pre; i++) out.push([i, i]);
  for (const [x, y] of mid) out.push([x + pre, y + pre]);
  for (let i = 0; i < suf; i++) out.push([a.length - suf + i, b.length - suf + i]);
  return out;
}

/** Myers O((N+M)D) dengan jejak V per langkah; mengembalikan pasangan baris yang cocok. */
function myers(a: string[], b: string[]): Array<[number, number]> | null {
  const n = a.length; const m = b.length; const max = n + m;
  if (!n || !m) return [];
  const off = max; const v = new Int32Array(2 * max + 2);
  // jejak per langkah d hanya jendela k ∈ [-d-1, d+1] (memori O(D²), bukan O(D·(N+M)))
  const trace: Array<{ lo: number; arr: Int32Array }> = [];
  let found = -1;
  for (let d = 0; d <= Math.min(max, MERGE_LIMITS.maxEditDistance); d++) {
    trace.push({ lo: off - d - 1, arr: v.slice(off - d - 1, off + d + 2) });
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) { found = d; break; }
    }
    if (found >= 0) break;
  }
  if (found < 0) return null;
  // runut balik dari (n, m)
  const pairs: Array<[number, number]> = []; let x = n; let y = m;
  for (let d = found; d > 0; d--) {
    const t = trace[d]; const at = (k: number) => t.arr[off + k - t.lo]; const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const px = at(prevK); const py = px - prevK;
    while (x > px && y > py) { x--; y--; pairs.push([x, y]); }
    x = px; y = py;
  }
  while (x > 0 && y > 0) { x--; y--; pairs.push([x, y]); }
  return pairs.reverse();
}

const eq = (p: string[], q: string[]) => p.length === q.length && p.every((s, i) => s === q[i]);

/** Gabungkan; null bila berkas terlalu besar/berbeda untuk dicoba otomatis (pemanggil memperlakukannya sebagai konflik seluruh berkas). */
export function merge3(base: string, mine: string, theirs: string, labels: { base?: string; theirs?: string } = {}): MergeResult | null {
  if (mine === theirs) return { clean: true, content: mine, conflicts: 0 };
  if (mine === base) return { clean: true, content: theirs, conflicts: 0 };
  if (theirs === base) return { clean: true, content: mine, conflicts: 0 };
  const O = base.split('\n'); const A = mine.split('\n'); const B = theirs.split('\n');
  const pa = lcsPairs(O, A); const pb = lcsPairs(O, B);
  if (!pa || !pb) return null;
  const mA = new Map(pa); const mB = new Map(pb);
  const sync: number[] = []; for (const [o] of pa) if (mB.has(o)) sync.push(o);
  const out: string[] = []; let conflicts = 0;
  let o = 0; let a = 0; let b = 0;
  const flush = (o1: number, a1: number, b1: number) => {
    const co = O.slice(o, o1); const ca = A.slice(a, a1); const cb = B.slice(b, b1);
    if (!co.length && !ca.length && !cb.length) return;
    if (eq(ca, co)) out.push(...cb);
    else if (eq(cb, co)) out.push(...ca);
    else if (eq(ca, cb)) out.push(...ca);
    else {
      conflicts++;
      out.push(MARK.mine, ...ca, `${MARK.base}${labels.base ? ' ' + labels.base : ''}`, ...co, MARK.sep, ...cb, `${MARK.theirs}${labels.theirs ? ' ' + labels.theirs : ''}`);
    }
  };
  for (const s of sync) {
    const sa = mA.get(s)!; const sb = mB.get(s)!;
    if (sa < a || sb < b) continue;                    // tidak monoton terhadap sisi lain → bukan titik sinkron yang sah
    flush(s, sa, sb);
    out.push(O[s]); o = s + 1; a = sa + 1; b = sb + 1;
  }
  flush(O.length, A.length, B.length);
  return { clean: conflicts === 0, content: out.join('\n'), conflicts };
}

/** Jumlah blok konflik yang BELUM diselesaikan dalam sebuah isi berkas (penanda awal di awal baris). */
export const unresolvedConflicts = (content: string): number => (content.match(/^<<<<<<< /gm) ?? []).length;
