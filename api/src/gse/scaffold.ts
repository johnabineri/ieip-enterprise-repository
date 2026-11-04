import { ProblemException } from '../common/problem';

export interface TplFile { path: string; content: string }
export interface GateResult { status: 'ok' | 'err' | 'skipped'; detail: string }

/** Variabel templat; sumber: eaw.application (via gse.app_gate) — deterministik, tanpa AI. */
export function varsFor(app: { kode: string; nama: string; platform: string | null; workspace: string | null; workspace_mode: string; federation_scope: string | null; repo_git: string | null; entity_code: string }) {
  const lower = app.kode.toLowerCase();
  const pascal = app.kode.split(/[^A-Za-z0-9]+/).filter(Boolean).map((s) => s[0].toUpperCase() + s.slice(1).toLowerCase()).join('');
  const platform = app.platform ?? app.kode;
  return {
    app_kode: app.kode, app_kode_lower: lower, app_kode_pascal: pascal, app_nama: app.nama,
    platform, platform_lower: platform.toLowerCase(), workspace: app.workspace ?? lower, workspace_mode: app.workspace_mode,
    federation_scope: app.federation_scope ?? 'saoraja_' + lower.replace(/[^a-z0-9]/g, '_'), iam_schema: 'set',
    repo_git: app.repo_git ?? `git.kalla/${platform.toLowerCase()}`, entity_code: app.entity_code,
  } as Record<string, string>;
}

const render = (s: string, vars: Record<string, string>, where: string) =>
  s.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new ProblemException(422, 'template-error', 'Variabel templat tidak dikenal', `${where}: {{${k}}} (variabel: ${Object.keys(vars).join(', ')})`);
    return vars[k];
  });

/** Merender berkas dari beberapa template. Path yang sama dengan isi berbeda = konflik (422); isi sama digabung. */
export function renderFiles(templates: Array<{ kode: string; files: TplFile[] }>, vars: Record<string, string>): TplFile[] {
  const out = new Map<string, { content: string; from: string }>();
  for (const t of templates) {
    for (const f of t.files) {
      const path = render(f.path, vars, `${t.kode}:path`).replace(/^\/+/, '');
      if (path.includes('..')) throw new ProblemException(422, 'template-error', 'Path templat tidak sah', `${t.kode}: ${path}`);
      const content = render(f.content, vars, `${t.kode}:${f.path}`);
      const prev = out.get(path);
      if (prev && prev.content !== content) throw new ProblemException(409, 'conflict', 'Template berkonflik', `${path} dihasilkan berbeda oleh ${prev.from} dan ${t.kode}`);
      if (!prev) out.set(path, { content, from: t.kode });
    }
  }
  return [...out.entries()].map(([path, v]) => ({ path, content: v.content })).sort((a, b) => a.path.localeCompare(b.path));
}

const PII_COLS = /\b(email|full_name|nik|npwp|phone|address)\b/i;

/** Gerbang yang dapat dijalankan LOKAL. lint/build/SCA/SBOM butuh CI runner — dicatat 'skipped' (bukan dipalsukan 'ok'). */
export function runGates(files: TplFile[]): Record<string, GateResult> {
  const pii: string[] = []; const manifest: string[] = [];
  for (const f of files) {
    if (f.path.endsWith('.sql')) {
      f.content.split('\n').forEach((line, i) => { if (!line.trim().startsWith('--') && PII_COLS.test(line)) pii.push(`${f.path}:${i + 1}`); });
    }
    if (f.path.endsWith('.json')) { try { JSON.parse(f.content); } catch { manifest.push(`${f.path}: JSON tidak valid`); } }
    if (/\.ya?ml$/.test(f.path) && f.content.includes('\t')) manifest.push(`${f.path}: tab tidak diizinkan di YAML`);
  }
  const ci = { status: 'skipped', detail: 'butuh CI runner (belum tersedia); dijalankan pipeline .ci/pipeline.yaml pada PR' } as GateResult;
  return {
    'pii-guard': pii.length ? { status: 'err', detail: `kolom PII terlarang (D-14): ${pii.join(', ')}` } : { status: 'ok', detail: `${files.filter((f) => f.path.endsWith('.sql')).length} berkas SQL dipindai` },
    manifest: manifest.length ? { status: 'err', detail: manifest.join('; ') } : { status: 'ok', detail: 'JSON/YAML manifest terurai' },
    lint: ci, build: ci, sca: ci, sbom: ci,
  };
}

/** Arsip tar (ustar) tanpa kompresi — bundel hasil generate yang dapat di-commit ke branch (tanpa dependensi eksternal). */
export function tar(files: TplFile[], prefix = ''): Buffer {
  const blocks: Buffer[] = []; const mtime = Math.floor(Date.now() / 1000);
  for (const f of files) {
    const name = prefix + f.path; const data = Buffer.from(f.content, 'utf8');
    if (Buffer.byteLength(name) > 100) throw new ProblemException(422, 'template-error', 'Path terlalu panjang untuk tar', name);
    const h = Buffer.alloc(512);
    h.write(name, 0, 100); h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
    h.write(data.length.toString(8).padStart(11, '0') + '\0', 124); h.write(mtime.toString(8).padStart(11, '0') + '\0', 136);
    h.write('        ', 148); h.write('0', 156); h.write('ustar\0', 257); h.write('00', 263);
    let sum = 0; for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    blocks.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

/** flow.yaml / agent.yaml dari spec tervalidasi. */
export function toYaml(kind: string, nama: string, spec: any): string {
  const q = (v: unknown) => (v === undefined || v === null || v === '' ? '~' : /^[\w.${}/-]+$/.test(String(v)) ? String(v) : JSON.stringify(String(v)));
  if (kind === 'saga') {
    return `apiVersion: panrita/v1\nkind: SagaFlow\nmetadata:\n  name: ${q(nama)}\n  engine: temporal.io   # D-07\nspec:\n  steps:\n${(spec.steps ?? []).map((s: any) =>
      `    - name: ${q(s.name)}\n      service: ${q(s.service)}\n      mutates: ${s.mutates === false ? 'false' : 'true'}\n      compensation: ${q(s.compensation)}\n      idempotencyKey: ${q(s.idempotencyKey)}\n`).join('')}`;
  }
  return `apiVersion: panrita/v1\nkind: AgentSpec\nmetadata:\n  name: ${q(nama)}\nspec:\n  autonomy: ${q(spec.autonomy)}   # D-06: maksimum L3\n  tools:\n${(spec.tools ?? []).map((t: string) => `    - ${q(t)}\n`).join('') || '    []\n'}  guardrails:\n    fail_mode: ${q(spec.guardrails?.fail_mode)}   # D-03\n`;
}
