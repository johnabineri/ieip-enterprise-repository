export interface GherkinReport { valid: boolean; errors: string[]; scenarios: number; steps: number }

const FEATURE = /^(Fitur|Feature)\s*:\s*\S/i;
const SCENARIO = /^(Skenario|Scenario|Skenario Outline|Scenario Outline)\s*:\s*\S/i;
const GIVEN = /^(Diberikan|Given)\s+\S/i, WHEN = /^(Ketika|When)\s+\S/i, THEN = /^(Maka|Then)\s+\S/i, AND = /^(Dan|And|Tetapi|But)\s+\S/i;
const BACKGROUND = /^(Latar Belakang|Background)\s*:?\s*$/i;

/** Validator sintaks Gherkin (Indonesia/Inggris): Fitur → ≥1 Skenario; tiap skenario berurutan Given → When → Then, tanpa langkah kosong. */
export function validateGherkin(text: string): GherkinReport {
  const errors: string[] = []; let scenarios = 0; let steps = 0;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (!lines.length || !FEATURE.test(lines[0])) return { valid: false, errors: ['baris pertama harus "Fitur: <judul>"'], scenarios: 0, steps: 0 };
  let cur: { name: string; g: number; w: number; t: number; phase: 0 | 1 | 2 | 3 } | null = null; let inBg = false;
  const close = () => {
    if (!cur) return;
    if (!cur.g || !cur.w || !cur.t) errors.push(`skenario "${cur.name}" wajib memuat Diberikan, Ketika, dan Maka`);
  };
  for (const l of lines.slice(1)) {
    if (BACKGROUND.test(l)) { close(); cur = null; inBg = true; continue; }
    if (SCENARIO.test(l)) { close(); inBg = false; scenarios++; cur = { name: l.replace(/^[^:]+:\s*/, ''), g: 0, w: 0, t: 0, phase: 0 }; continue; }
    const isG = GIVEN.test(l), isW = WHEN.test(l), isT = THEN.test(l), isA = AND.test(l);
    if (isG || isW || isT || isA) {
      steps++;
      if (inBg) continue;
      if (!cur) { errors.push(`langkah di luar skenario: "${l.slice(0, 40)}"`); continue; }
      if (isG) { if (cur.phase > 1) errors.push(`skenario "${cur.name}": Diberikan setelah Ketika/Maka`); cur.g++; cur.phase = Math.max(cur.phase, 1) as 1; }
      else if (isW) { if (cur.phase > 2) errors.push(`skenario "${cur.name}": Ketika setelah Maka`); cur.w++; cur.phase = Math.max(cur.phase, 2) as 2; }
      else if (isT) { cur.t++; cur.phase = 3; }
      continue;
    }
    if (/^(Skenario|Scenario|Diberikan|Ketika|Maka|Given|When|Then|Dan|And)\s*$/i.test(l)) errors.push(`langkah kosong: "${l}"`);
    // baris lain = deskripsi bebas (mis. "Sebagai … Saya ingin …") — diizinkan
  }
  close();
  if (!scenarios) errors.push('minimal 1 Skenario');
  return { valid: errors.length === 0, errors, scenarios, steps };
}
