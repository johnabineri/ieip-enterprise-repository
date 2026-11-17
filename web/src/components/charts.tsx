'use client';
/* Grafik SVG kecil (mockup: App.Chart.line/bars, ikaColor/heatBg) — kelas .chart/.grid-l dari mockup; tanpa pustaka grafik. */
import * as React from 'react';

export const ikaColor = (v: number) => (v >= 3.5 ? 'var(--ok)' : v >= 2.5 ? 'var(--d2)' : v >= 1.8 ? 'var(--warn)' : 'var(--err)');
export const heatBg = (v: number) => `color-mix(in srgb, ${ikaColor(v)} ${Math.round(18 + (v / 5) * 50)}%, var(--surface))`;

export function LineChart({ series, labels = [], w = 560, h = 200, max, min = 0, color = 'var(--accent)', target, fmt = (v: number) => String(v) }: {
  series: number[]; labels?: string[]; w?: number; h?: number; max?: number; min?: number; color?: string; target?: number; fmt?: (v: number) => string;
}) {
  const pad = { l: 36, r: 12, t: 12, b: 26 }; const mx = max ?? Math.max(...series, 1) * 1.15;
  const x = (i: number) => pad.l + (i * (w - pad.l - pad.r)) / Math.max(1, series.length - 1);
  const y = (v: number) => pad.t + (1 - (v - min) / (mx - min)) * (h - pad.t - pad.b);
  const pts = series.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img">
      {[0, 1, 2, 3, 4].map((i) => { const v = min + ((mx - min) * i) / 4; return <g key={i}><line className="grid-l" x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} /><text x={pad.l - 6} y={y(v) + 4} textAnchor="end">{fmt(+v.toFixed(1))}</text></g>; })}
      {target != null ? <><line x1={pad.l} x2={w - pad.r} y1={y(target)} y2={y(target)} stroke="var(--ok)" strokeDasharray="4 4" /><text x={w - pad.r} y={y(target) - 5} textAnchor="end" style={{ fill: 'var(--ok)' }}>target {fmt(target)}</text></> : null}
      <polygon points={`${pad.l},${y(min)} ${pts} ${x(series.length - 1)},${y(min)}`} fill={color} opacity={0.12} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
      {series.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={3.5} fill="var(--surface)" stroke={color} strokeWidth={2}><title>{labels[i] ? `${labels[i]}: ${fmt(v)}` : fmt(v)}</title></circle>)}
      {labels.map((l, i) => (series.length <= 12 || i % Math.ceil(series.length / 12) === 0 ? <text key={i} x={x(i)} y={h - 8} textAnchor="middle">{l}</text> : null))}
    </svg>
  );
}

export function BarChart({ items, w = 560, h = 210, max, color = 'var(--d2)', fmt = (v: number) => String(v) }: { items: { l: string; v: number; c?: string }[]; w?: number; h?: number; max?: number; color?: string; fmt?: (v: number) => string }) {
  const pad = { l: 8, r: 8, t: 18, b: 34 }; const mx = max ?? Math.max(...items.map((i) => i.v), 1) * 1.15; const bw = (w - pad.l - pad.r) / Math.max(1, items.length);
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img">
      {items.map((it, i) => {
        const bh = (it.v / mx) * (h - pad.t - pad.b); const x = pad.l + i * bw + bw * 0.18; const y = h - pad.b - bh;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw * 0.64} height={bh} rx={4} fill={it.c || color}><title>{`${it.l}: ${fmt(it.v)}`}</title></rect>
            <text x={x + bw * 0.32} y={y - 5} textAnchor="middle" style={{ fill: 'var(--text)', fontWeight: 700 }}>{fmt(it.v)}</text>
            {items.length <= 31 ? <text x={x + bw * 0.32} y={h - 14} textAnchor="middle">{it.l}</text> : null}
          </g>
        );
      })}
      <line className="grid-l" x1={pad.l} x2={w - pad.r} y1={h - pad.b} y2={h - pad.b} />
    </svg>
  );
}
