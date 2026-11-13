/**
 * Parser XML minimal dan AMAN untuk impor Open Group Exchange (EAW-09). Tanpa dependensi. Sengaja menolak DOCTYPE/ENTITY (kebal XXE & "billion laughs"),
 * entitas selain 5 standar + rujukan numerik, serta membatasi ukuran, kedalaman, dan jumlah elemen. Mendukung deklarasi XML, komentar, CDATA, atribut
 * berkutip ganda/tunggal, dan awalan namespace (nama dipertahankan apa adanya, mis. "xsi:type"). BUKAN validator skema.
 */
export interface XNode { name: string; attrs: Record<string, string>; children: XNode[]; text: string }
export class XmlError extends Error { constructor(msg: string, public line: number) { super(msg); } }
export const local = (n: string) => n.slice(n.lastIndexOf(':') + 1);
export const attr = (n: XNode, key: string) => n.attrs[key] ?? Object.entries(n.attrs).find(([k]) => local(k) === key)?.[1];
export const kids = (n: XNode, name: string) => n.children.filter((c) => local(c.name) === name);

const NAME = /[A-Za-z_][\w:.-]*/y;
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function parseXml(input: string, lim = { maxBytes: 2_000_000, maxDepth: 40, maxNodes: 20_000 }): XNode {
  let s = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (Buffer.byteLength(s, 'utf8') > lim.maxBytes) throw new XmlError(`XML melebihi ${lim.maxBytes} byte`, 1);
  const lineAt = (pos: number) => { let l = 1; for (let i = 0; i < pos && i < s.length; i++) if (s.charCodeAt(i) === 10) l++; return l; };
  if (/<!DOCTYPE|<!ENTITY/i.test(s)) throw new XmlError('DTD/ENTITY tidak diizinkan (perlindungan XXE)', lineAt(s.search(/<!DOCTYPE|<!ENTITY/i)));
  const decode = (t: string, pos: number) => t.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);/g, (m, g: string) => {
    if (g[0] === '#') { const cp = g[1] === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10); if (!Number.isFinite(cp) || cp < 0x20 && ![9, 10, 13].includes(cp) || cp > 0x10ffff) throw new XmlError(`rujukan karakter tidak sah: ${m}`, lineAt(pos)); return String.fromCodePoint(cp); }
    if (!(g in ENT)) throw new XmlError(`entitas tidak didefinisikan: ${m}`, lineAt(pos));
    return ENT[g];
  });
  if (/&(?![#A-Za-z][\w]*;)/.test(s.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, ''))) throw new XmlError('karakter & tidak sah (gunakan &amp;)', lineAt(s.search(/&(?![#A-Za-z][\w]*;)/)));

  const stack: XNode[] = []; let root: XNode | null = null; let nodes = 0; let i = 0;
  const top = () => stack[stack.length - 1];
  while (i < s.length) {
    if (s[i] !== '<') {                                                       // teks
      const j = s.indexOf('<', i); const end = j < 0 ? s.length : j; const raw = s.slice(i, end);
      if (top()) top().text += decode(raw, i); else if (raw.trim()) throw new XmlError('teks di luar elemen akar', lineAt(i));
      i = end; continue;
    }
    if (s.startsWith('<?', i)) { const e = s.indexOf('?>', i + 2); if (e < 0) throw new XmlError('instruksi pemrosesan tidak ditutup', lineAt(i)); i = e + 2; continue; }
    if (s.startsWith('<!--', i)) { const e = s.indexOf('-->', i + 4); if (e < 0) throw new XmlError('komentar tidak ditutup', lineAt(i)); i = e + 3; continue; }
    if (s.startsWith('<![CDATA[', i)) { const e = s.indexOf(']]>', i + 9); if (e < 0) throw new XmlError('CDATA tidak ditutup', lineAt(i)); if (!top()) throw new XmlError('CDATA di luar elemen akar', lineAt(i)); top().text += s.slice(i + 9, e); i = e + 3; continue; }
    if (s.startsWith('<!', i)) throw new XmlError('deklarasi <! tidak didukung', lineAt(i));
    if (s.startsWith('</', i)) {
      NAME.lastIndex = i + 2; const m = NAME.exec(s); if (!m) throw new XmlError('tag penutup tidak sah', lineAt(i));
      let k = i + 2 + m[0].length; while (/\s/.test(s[k] ?? '')) k++;
      if (s[k] !== '>') throw new XmlError('tag penutup tidak sah', lineAt(i));
      const cur = stack.pop(); if (!cur || cur.name !== m[0]) throw new XmlError(`tag penutup </${m[0]}> tidak cocok${cur ? ` dengan <${cur.name}>` : ''}`, lineAt(i));
      cur.text = cur.text.trim(); i = k + 1; continue;
    }
    // tag pembuka
    NAME.lastIndex = i + 1; const m = NAME.exec(s); if (!m) throw new XmlError('nama elemen tidak sah', lineAt(i));
    const node: XNode = { name: m[0], attrs: {}, children: [], text: '' }; let k = i + 1 + m[0].length; let selfClose = false;
    for (;;) {
      while (/\s/.test(s[k] ?? '')) k++;
      if (k >= s.length) throw new XmlError(`tag <${node.name}> tidak ditutup`, lineAt(i));
      if (s[k] === '>') { k++; break; }
      if (s[k] === '/' && s[k + 1] === '>') { selfClose = true; k += 2; break; }
      NAME.lastIndex = k; const a = NAME.exec(s); if (!a) throw new XmlError(`atribut tidak sah pada <${node.name}>`, lineAt(k));
      k += a[0].length; while (/\s/.test(s[k] ?? '')) k++;
      if (s[k] !== '=') throw new XmlError(`atribut ${a[0]} tanpa nilai`, lineAt(k)); k++; while (/\s/.test(s[k] ?? '')) k++;
      const q = s[k]; if (q !== '"' && q !== "'") throw new XmlError(`nilai atribut ${a[0]} harus berkutip`, lineAt(k));
      const e = s.indexOf(q, k + 1); if (e < 0) throw new XmlError(`nilai atribut ${a[0]} tidak ditutup`, lineAt(k));
      const val = s.slice(k + 1, e); if (val.includes('<')) throw new XmlError(`karakter < tidak sah dalam atribut ${a[0]}`, lineAt(k));
      if (a[0] in node.attrs) throw new XmlError(`atribut ganda ${a[0]}`, lineAt(k));
      node.attrs[a[0]] = decode(val, k); k = e + 1;
    }
    if (++nodes > lim.maxNodes) throw new XmlError(`XML melebihi ${lim.maxNodes} elemen`, lineAt(i));
    if (top()) top().children.push(node); else if (root) throw new XmlError('lebih dari satu elemen akar', lineAt(i)); else root = node;
    if (!selfClose) { stack.push(node); if (stack.length > lim.maxDepth) throw new XmlError(`kedalaman XML melebihi ${lim.maxDepth}`, lineAt(i)); }
    i = k;
  }
  if (stack.length) throw new XmlError(`tag <${top().name}> tidak ditutup`, lineAt(s.length));
  if (!root) throw new XmlError('XML kosong', 1);
  return root;
}
