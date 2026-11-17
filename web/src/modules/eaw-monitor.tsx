'use client';
/* Redundancy & Drift Monitor + KPI Ekosistem (mockup pages-eaw.js), dari GET /api/v1/eaw/ecosystem — SEMUA dari data nyata & RLS pemanggil.
   Yang tidak bisa dideteksi (shadow IT, endpoint tanpa kontrak di gateway) ditampilkan sebagai batas, bukan diisi data contoh; KPI tanpa
   sumber data nyata tampil '—' beserta alasannya. */
import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { Callout, Card, Hbar } from '@/components/ui';
import { t } from '@/lib/i18n';

interface Signal { level: 'err' | 'warn' | 'info'; kind: string; title: string; detail: string; route?: string }
interface Kpi { id: string; label: string; value: string | null; pct: number | null; target: string; basis: string; reason?: string }
interface Eco { generatedAt: string; threshold: number; redundancy: Signal[]; drift: Signal[]; kpis: Kpi[]; notCovered: string[]; unavailable: boolean }

const ICON = { err: '⛔', warn: '⚠', info: '↻' } as const;
const PILL = { err: 'b-err', warn: 'b-warn', info: 'b-info' } as const;

function useEco() { return useQuery({ queryKey: ['eaw', 'ecosystem'], queryFn: () => api.get<Eco>('/api/v1/eaw/ecosystem') }); }

export function RedundancyDrift() {
  const q = useEco();
  const d = q.data;
  const rows = d ? [...d.redundancy, ...d.drift] : [];
  return (
    <Card title="Redundancy & Drift Monitor" meta={d ? t('{0} sinyal · kemiripan ≥ {1}%', rows.length, d.threshold) : undefined} flush>
      {q.isError ? <div style={{ padding: 14 }}><Callout tone="err">{api.explain(q.error)}</Callout></div>
        : !d ? <div className="muted small" style={{ padding: 14 }}>{t('Memuat…')}</div>
        : (
          <>
            {rows.length === 0 ? <div className="muted small" style={{ padding: 14 }}>{t('Tidak ada sinyal redundansi atau drift pada data yang terlihat oleh Anda.')}</div> : (
              <div className="list">
                {rows.map((r, i) => (
                  <div className="li" key={i}>
                    <span className="ic">{ICON[r.level]}</span>
                    <div className="bd"><div className="t">{r.route ? <Link href={r.route}>{r.title}</Link> : r.title}</div><div className="d">{r.detail}</div></div>
                    <span className={`badge ${PILL[r.level]}`}>{r.kind}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="tiny muted" style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
              <b>{t('Belum terdeteksi:')}</b> {d.notCovered.join(' · ')}
              {d.unavailable ? <> · {t('sebagian sumber tidak terbaca oleh peran Anda')}</> : null}
            </div>
          </>
        )}
    </Card>
  );
}

export function EcosystemKpi() {
  const q = useEco();
  const d = q.data;
  const colorOf = (p: number) => (p >= 100 ? 'var(--ok)' : p >= 80 ? 'var(--d2)' : 'var(--warn)');
  return (
    <Card title={t('KPI Ekosistem (PRD §15)')} meta={t('capaian vs target')}>
      {q.isError ? <Callout tone="err">{api.explain(q.error)}</Callout>
        : !d ? <span className="muted small">{t('Memuat…')}</span>
        : d.kpis.map((k) => (
          <div key={k.id} title={k.reason ?? k.basis}>
            <Hbar label={`${k.id} · ${k.label}`} total={100} valueText={k.value ?? '—'}
              segments={k.pct == null ? [] : [{ v: k.pct, color: colorOf(k.pct), title: `${k.pct}% · ${t('target')} ${k.target}` }]} />
            <div className="tiny muted" style={{ margin: '-4px 0 8px' }}>{k.value == null ? k.reason : `${t('target')} ${k.target}`}</div>
          </div>
        ))}
    </Card>
  );
}
