// Menurunkan src/styles/eap.css dari mockup eap/ui/assets/styles.css: semua aturan dibungkus `.eap-root { … }` (CSS nesting)
// agar gaya EAP tidak bocor ke Host. Pemakaian: node scope-css.mjs <mockup styles.css> <keluaran eap.css>
import { readFileSync, writeFileSync } from 'node:fs';

const [, , src, out] = process.argv;
let css = readFileSync(src, 'utf8').replace(/\r\n/g, '\n');

// 1) variabel tema: blok :root (terang), @media gelap, :root[data-theme=dark]
const light = css.match(/:root\{([\s\S]*?)\n\}/)[1];
const dark = css.match(/:root\[data-theme="dark"\]\{([\s\S]*?)\n\}/)[1];
const rulesStart = css.indexOf('*{box-sizing:border-box}');
let rules = css.slice(rulesStart);

// 2) aturan tingkat dokumen → elemen akar
rules = rules
  .replace('*{box-sizing:border-box}', '&,& *,& *::before,& *::after{box-sizing:border-box}')
  .replace('html,body{margin:0;height:100%}\n', '')
  .replace('body{background:var(--bg);color:var(--text);font:14px/1.5 var(--font);-webkit-font-smoothing:antialiased}',
    '&{background:var(--bg);color:var(--text);font:14px/1.5 var(--font);-webkit-font-smoothing:antialiased;height:100%}')
  .replace(':root[data-theme="dark"] .btn.pri', '&[data-theme="dark"] .btn.pri')
  .replace(':root:not([data-theme="light"]) .btn.pri', '&:not([data-theme="light"]) .btn.pri')
  .replace(/body\.nav-collapsed /g, '&.nav-collapsed ')
  // shell: tinggi dari wadah (Host) — mandiri = 100vh lewat --eap-height
  .replace('height:100vh;transition:grid-template-columns', 'height:var(--eap-height,100vh);transition:grid-template-columns');

// 3) @keyframes tidak boleh bersarang di aturan gaya → keluarkan
const keyframes = [];
rules = rules.replace(/@keyframes [^{]+\{[^{}]*\{[^}]*\}[^{}]*\{[^}]*\}\}\n?/g, (m) => { keyframes.push(m.trim()); return ''; });
// 4) @supports selector() lama untuk Firefox: ganti dengan scrollbar-width standar
rules = rules.replace(/@supports not selector\(::-webkit-scrollbar\)\{[^\n]*\n/, '& *{scrollbar-width:thin;scrollbar-color:var(--border-strong) transparent}\n');

const indent = (s) => s.split('\n').map((l) => (l ? '  ' + l : l)).join('\n');
const body = `/* =====================================================================
   DITURUNKAN OTOMATIS dari eap/ui/assets/styles.css (mockup EAP) — jangan sunting bagian ini dengan tangan;
   ubah mockup lalu jalankan ulang scripts/scope-css.mjs. Semua aturan di bawah .eap-root (tidak bocor ke Host).
   Tambahan khusus aplikasi React ada di app.css.
   ===================================================================== */
${keyframes.join('\n')}

.eap-root{
  /* token tema terang */
${indent(light.trim().split('\n').map((l) => l.trim()).join('\n'))}

  &[data-theme="dark"]{
${indent(indent(dark.trim().split('\n').map((l) => l.trim()).join('\n')))}
  }
  @media (prefers-color-scheme:dark){
    &:not([data-theme="light"]){
${indent(indent(indent(dark.trim().split('\n').map((l) => l.trim()).join('\n'))))}
    }
  }

${indent(rules.trim())}
}
`;
writeFileSync(out, body);
console.log(`eap.css: ${body.split('\n').length} baris, ${keyframes.length} keyframes dikeluarkan`);
