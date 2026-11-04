import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query, Res } from '@nestjs/common';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { CurrentUser, Principal, RequirePermission } from '../auth/auth';
import { pageLimit, uuidOr400 } from '../common/http';
import { ProblemException } from '../common/problem';
import { DbService } from '../db/db.service';
import { compose, deterministic, GREETING, llm, llmCfg, Slots, Step } from './elicit';
import { validateGherkin } from './gherkin';
import { evaluate, maskPii, MAX_LEN } from './guardrails';

class CreateSessionDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) title?: string;
  @IsOptional() @IsUUID() applicationId?: string;
}
class MessageDto { @IsString() @MinLength(1) @MaxLength(MAX_LEN + 1000) content: string; }

const sDto = (r: any) => ({ id: r.id, title: r.title, applicationId: r.application_id, mode: r.mode, stage: r.stage, status: r.status, createdAt: r.created_at });
const storyDto = (r: any) => ({ id: r.id, sessionId: r.session_id, code: r.code, title: r.title, story: r.story, acceptance: r.acceptance, gherkin: r.gherkin, priority: r.priority,
  valid: r.valid, validation: r.validation, engine: r.engine, createdAt: r.created_at });
const mDto = (r: any) => ({ seq: r.seq, role: r.role, content: r.content, meta: r.meta, createdAt: r.created_at });

export const storyMarkdown = (stories: any[]) => `# Spesifikasi Kebutuhan — dihasilkan REQ Assistant\n\n` + stories.map((s) => `## ${s.code} — ${s.title}\n\n${s.story}\n\n**Acceptance criteria**\n\n${(s.acceptance as string[]).map((a) => `- ${a}`).join('\n')}\n\n\`\`\`gherkin\n${s.gherkin.trimEnd()}\n\`\`\`\n`).join('\n');

/**
 * REQ (REQ-01..03). Urutan tiap pesan: (1) guardrail deterministik [fail-closed] → (2) masking PII → (3) mesin elisitasi
 * (LLM OpenAI-compatible bila LLM_BASE_URL diisi, selain itu mode deterministik terpandu) → (4) validasi Gherkin → simpan.
 * Pesan yang ditolak guardrail TIDAK menyentuh LLM; kutipan di log dimasking.
 */
@Controller('api/v1/req')
export class ReqController {
  constructor(private readonly db: DbService) {}

  @Get('status') @RequirePermission('req.session.write')
  status() { const c = llmCfg(); return { mode: c ? 'llm' : 'deterministic', model: c?.model ?? null, guardrails: { engine: 'deterministic-local', failClosed: true, maxLength: MAX_LEN }, greeting: GREETING }; }

  @Get('sessions') @RequirePermission('req.session.write')
  sessions(@CurrentUser() p: Principal, @Query() q: Record<string, string>) {
    const limit = pageLimit(q.limit);
    return this.db.tx(p, async (c) => ({ data: (await c.query('SELECT * FROM req.session WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1', [limit])).rows.map(sDto) }));
  }

  @Post('sessions') @HttpCode(201) @RequirePermission('req.session.write')
  create(@CurrentUser() p: Principal, @Body() b: CreateSessionDto) {
    const mode = llmCfg() ? 'llm' : 'deterministic';
    return this.db.tx(p, async (c) => {
      const s = (await c.query(`INSERT INTO req.session (title, application_id, mode) VALUES (COALESCE($1,'Sesi elisitasi'),$2,$3) RETURNING *`, [b.title ?? null, b.applicationId ?? null, mode])).rows[0];
      await c.query(`INSERT INTO req.message (session_id, seq, role, content, meta) VALUES ($1, 1, 'assistant', $2, $3::jsonb)`, [s.id, GREETING, JSON.stringify({ engine: mode })]);
      return sDto(s);
    });
  }

  @Get('sessions/:id') @RequirePermission('req.session.write')
  get(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.db.tx(p, async (c) => {
      const s = (await c.query('SELECT * FROM req.session WHERE id = $1 AND deleted_at IS NULL', [uuidOr400(id)])).rows[0];
      if (!s) throw new NotFoundException('sesi tidak ditemukan');
      const msgs = (await c.query('SELECT * FROM req.message WHERE session_id = $1 ORDER BY seq', [id])).rows.map(mDto);
      const stories = (await c.query('SELECT * FROM req.story WHERE session_id = $1 AND deleted_at IS NULL ORDER BY created_at', [id])).rows.map(storyDto);
      return { ...sDto(s), messages: msgs, stories };
    });
  }

  @Post('sessions/:id/messages') @HttpCode(200) @RequirePermission('req.session.write')
  async send(@CurrentUser() p: Principal, @Param('id') id: string, @Body() b: MessageDto) {
    // --- (1) guardrail, fail-closed: galat evaluasi → 503
    const seqBase = await this.db.tx(p, async (c) => {
      const s = (await c.query('SELECT status FROM req.session WHERE id = $1 AND deleted_at IS NULL', [uuidOr400(id)])).rows[0];
      if (!s) throw new NotFoundException('sesi tidak ditemukan');
      if (s.status === 'completed') throw new ProblemException(409, 'invalid-state', 'Sesi sudah selesai', 'Buat sesi baru untuk kebutuhan lain.');
      return (await c.query('SELECT COALESCE(max(seq),0)::int AS n, count(*) FILTER (WHERE role = \'user\' AND COALESCE((meta->>\'blocked\')::boolean, false) = false)::int AS u FROM req.message WHERE session_id = $1', [id])).rows[0];
    });
    let verdict;
    try { verdict = evaluate(b.content, seqBase.u === 0); } catch (e) { throw new ProblemException(503, 'guardrail-unavailable', 'Guardrail tidak tersedia', (e as Error).message); }
    const masked = maskPii(b.content);          // PII tidak pernah disimpan / dikirim ke LLM
    if (!verdict.allowed) {
      return this.db.tx(p, async (c) => {
        await c.query(`INSERT INTO req.message (session_id, seq, role, content, meta) VALUES ($1,$2,'user',$3,$4::jsonb), ($1,$5,'system',$6,$7::jsonb)`,
          [id, seqBase.n + 1, masked.text, JSON.stringify({ blocked: true, masked: masked.found }), seqBase.n + 2, `⛔ Diblokir — ${verdict.reason}`, JSON.stringify({ blocked: true, engine: verdict.engine, category: verdict.category, ms: verdict.ms })]);
        await c.query(`INSERT INTO req.guard_log (session_id, user_id, engine, category, excerpt, ms) VALUES ($1,$2,$3,$4,$5,$6)`, [id, p.userId, verdict.engine, verdict.category, masked.text.slice(0, 120), verdict.ms]);
        return { blocked: true, engine: verdict.engine, category: verdict.category, reason: verdict.reason, ms: verdict.ms, stage: null, reply: null, story: null };
      });
    }
    // --- (3) mesin elisitasi
    const sess = await this.db.tx(p, async (c) => (await c.query('SELECT mode, stage FROM req.session WHERE id = $1', [id])).rows[0]);
    const prior = await this.db.tx(p, async (c) => (await c.query('SELECT role, content, meta FROM req.message WHERE session_id = $1 ORDER BY seq', [id])).rows);
    let step: Step; let engine: string; const t0 = Date.now();
    if (sess.mode === 'llm') {
      const cfg = llmCfg(); if (!cfg) throw new ProblemException(503, 'llm-unavailable', 'LLM tidak dikonfigurasi', 'Sesi dibuat dalam mode LLM tetapi LLM_BASE_URL tidak diatur.');
      const hist = prior.filter((m: any) => (m.role === 'user' && !m.meta.blocked) || (m.role === 'assistant')).map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      // SEC-01: kill-switch diperiksa SEBELUM tiap pemanggilan LLM (efek segera)
      const on = await this.db.tx(p, async (c) => (await c.query(`SELECT console.agent_enabled('req-llm') AS on`)).rows[0].on);
      if (!on) throw new ProblemException(503, 'agent-disabled', 'Agen REQ (LLM) dinonaktifkan kill-switch', 'Dinonaktifkan melalui CONSOLE → Security Center. Pesan tidak dikirim ke LLM.');
      const r = await llm(cfg, [...hist, { role: 'user', content: masked.text }]); step = r.step; engine = `llm:${cfg.model}`;
      // FIN-01: metering token (biaya dihitung DB dari harga model terdaftar)
      await this.db.tx(p, async (c) => { await c.query(`INSERT INTO console.token_usage (model_name, workspace, entity_id, user_id, prompt_tokens, completion_tokens)
        VALUES ($1,'req',(SELECT a.entity_id FROM req.session s JOIN eaw.application a ON a.id = s.application_id WHERE s.id = $2),$3,$4,$5)`, [cfg.model, id, p.userId, r.usage.prompt, r.usage.completion]); });
    } else {
      const slots: Slots = prior.reduce((acc: Slots, m: any) => ({ ...acc, ...(m.meta?.slots ?? {}) }), {});
      step = deterministic(sess.stage, masked.text, slots); engine = 'deterministic';
    }
    // --- (4) validasi + simpan
    return this.db.tx(p, async (c) => {
      const seq = seqBase.n + 1;
      await c.query(`INSERT INTO req.message (session_id, seq, role, content, meta) VALUES ($1,$2,'user',$3,$4::jsonb)`, [id, seq, masked.text, JSON.stringify({ masked: masked.found, guardMs: verdict.ms, slots: step.kind === 'ask' ? step.slots : undefined })]);
      if (step.kind === 'ask') {
        await c.query(`INSERT INTO req.message (session_id, seq, role, content, meta) VALUES ($1,$2,'assistant',$3,$4::jsonb)`, [id, seq + 1, step.text, JSON.stringify({ engine, ms: Date.now() - t0, warnings: step.warnings ?? [] })]);
        await c.query('UPDATE req.session SET stage = $2 WHERE id = $1', [id, step.stage]);
        return { blocked: false, reply: step.text, stage: step.stage, story: null, warnings: step.warnings ?? [], engine, masked: masked.found, guardMs: verdict.ms };
      }
      const rep = validateGherkin(step.story.gherkin);
      if (!rep.valid) throw new ProblemException(502, 'llm-invalid-output', 'Gherkin tidak valid', rep.errors.join('; '));
      const st = (await c.query(`INSERT INTO req.story (session_id, title, story, acceptance, gherkin, priority, valid, validation, engine) VALUES ($1,$2,$3,$4::jsonb,$5,$6,true,$7::jsonb,$8) RETURNING *`,
        [id, step.story.title, step.story.story, JSON.stringify(step.story.acceptance), step.story.gherkin, step.story.priority, JSON.stringify(rep), engine])).rows[0];
      const text = `✓ User Story ${st.code} dan ${rep.scenarios} skenario Gherkin dihasilkan (validasi sintaks lolos).${step.warnings.length ? '\n⚠ ' + step.warnings.join('\n⚠ ') : ''}`;
      await c.query(`INSERT INTO req.message (session_id, seq, role, content, meta) VALUES ($1,$2,'assistant',$3,$4::jsonb)`, [id, seq + 1, text, JSON.stringify({ engine, ms: Date.now() - t0, storyId: st.id, warnings: step.warnings })]);
      await c.query(`UPDATE req.session SET stage = $2, status = 'completed' WHERE id = $1`, [id, step.stage]);
      return { blocked: false, reply: text, stage: step.stage, story: storyDto(st), warnings: step.warnings, engine, masked: masked.found, guardMs: verdict.ms };
    });
  }

  @Get('stories') @RequirePermission('req.session.write')
  stories(@CurrentUser() p: Principal) {
    return this.db.tx(p, async (c) => ({ data: (await c.query('SELECT * FROM req.story WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 200')).rows.map(storyDto) }));
  }

  /** Ekspor Markdown semua story milik pengguna, atau satu sesi (?sessionId=). */
  @Get('export') @RequirePermission('req.session.write')
  async export(@CurrentUser() p: Principal, @Query('sessionId') sessionId: string | undefined, @Res() res: Response) {
    const rows = await this.db.tx(p, async (c) => sessionId
      ? (await c.query('SELECT * FROM req.story WHERE session_id = $1 AND deleted_at IS NULL ORDER BY created_at', [uuidOr400(sessionId, 'sessionId')])).rows
      : (await c.query('SELECT * FROM req.story WHERE deleted_at IS NULL ORDER BY created_at')).rows);
    if (!rows.length) throw new ProblemException(404, 'not-found', 'Belum ada User Story untuk diekspor');
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="requirements.md"');
    res.send(storyMarkdown(rows));
  }

  /** Statistik guardrail nyata (jumlah ditolak per kategori, rata-rata evaluasi). Pemilik: log sendiri; set.audit.read: semua. */
  @Get('guard/stats') @RequirePermission('req.session.write')
  guard(@CurrentUser() p: Principal) {
    return this.db.tx(p, async (c) => {
      const t = (await c.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today, COALESCE(round(avg(ms))::int, 0) AS avg_ms, COALESCE(max(ms), 0)::int AS max_ms FROM req.guard_log`)).rows[0];
      const cat = (await c.query('SELECT category, engine, count(*)::int AS n FROM req.guard_log GROUP BY 1,2 ORDER BY 3 DESC')).rows;
      const recent = (await c.query('SELECT engine, category, excerpt, ms, created_at FROM req.guard_log ORDER BY id DESC LIMIT 10')).rows;
      return { total: t.total, today: t.today, avgMs: t.avg_ms, maxMs: t.max_ms, targetMs: 150, byCategory: cat, recent };
    });
  }
}
