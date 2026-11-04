import { ProblemException } from '../common/problem';

/** Metamodel ArchiMate 3.2 (subset yang dipakai EAP). Layer: s=Strategy b=Business a=Application t=Technology p=Physical m=Motivation i=Implementation. */
export const ELEMENTS: Record<string, { layer: string; label: string; kind: 'active' | 'behavior' | 'passive' | 'other' }> = {
  Capability: { layer: 's', label: 'Capability', kind: 'behavior' }, Resource: { layer: 's', label: 'Resource', kind: 'passive' }, ValueStream: { layer: 's', label: 'Value Stream', kind: 'behavior' }, CourseOfAction: { layer: 's', label: 'Course of Action', kind: 'other' },
  BusinessActor: { layer: 'b', label: 'Business Actor', kind: 'active' }, BusinessRole: { layer: 'b', label: 'Business Role', kind: 'active' }, BusinessProcess: { layer: 'b', label: 'Business Process', kind: 'behavior' },
  BusinessFunction: { layer: 'b', label: 'Business Function', kind: 'behavior' }, BusinessService: { layer: 'b', label: 'Business Service', kind: 'behavior' }, BusinessObject: { layer: 'b', label: 'Business Object', kind: 'passive' }, BusinessEvent: { layer: 'b', label: 'Business Event', kind: 'behavior' },
  ApplicationComponent: { layer: 'a', label: 'Application Component', kind: 'active' }, ApplicationService: { layer: 'a', label: 'Application Service', kind: 'behavior' }, ApplicationInterface: { layer: 'a', label: 'Application Interface', kind: 'active' }, DataObject: { layer: 'a', label: 'Data Object', kind: 'passive' },
  Node: { layer: 't', label: 'Node', kind: 'active' }, Device: { layer: 't', label: 'Device', kind: 'active' }, SystemSoftware: { layer: 't', label: 'System Software', kind: 'active' }, TechnologyService: { layer: 't', label: 'Technology Service', kind: 'behavior' },
  CommunicationNetwork: { layer: 't', label: 'Communication Network', kind: 'active' }, Artifact: { layer: 't', label: 'Artifact', kind: 'passive' },
  Facility: { layer: 'p', label: 'Facility', kind: 'active' }, Equipment: { layer: 'p', label: 'Equipment', kind: 'active' },
  Stakeholder: { layer: 'm', label: 'Stakeholder', kind: 'other' }, Driver: { layer: 'm', label: 'Driver', kind: 'other' }, Goal: { layer: 'm', label: 'Goal', kind: 'other' }, Requirement: { layer: 'm', label: 'Requirement', kind: 'other' }, Constraint: { layer: 'm', label: 'Constraint', kind: 'other' }, Principle: { layer: 'm', label: 'Principle', kind: 'other' },
  WorkPackage: { layer: 'i', label: 'Work Package', kind: 'behavior' }, Deliverable: { layer: 'i', label: 'Deliverable', kind: 'passive' },
};
export const RELATIONS = ['composition', 'aggregation', 'assignment', 'realization', 'serving', 'access', 'influence', 'triggering', 'flow', 'specialization', 'association'] as const;

/** Objek EAW yang dapat diikat ke node → tipe elemen yang sah. */
export const BINDABLE: Record<string, string[]> = {
  application: ['ApplicationComponent', 'ApplicationInterface'], service: ['BusinessService', 'ApplicationService', 'TechnologyService'], process: ['BusinessProcess', 'BusinessFunction'],
  data_entity: ['DataObject', 'BusinessObject'], infra_asset: ['Node', 'Device', 'SystemSoftware', 'CommunicationNetwork', 'Facility'], control: ['Requirement', 'Constraint', 'Principle'],
};
/** Tipe elemen bawaan saat mengimpor objek EAW ke diagram. */
export const DEFAULT_ELEMENT: Record<string, string> = { application: 'ApplicationComponent', service: 'BusinessService', process: 'BusinessProcess', data_entity: 'DataObject', infra_asset: 'Node', control: 'Requirement' };
/** eaw.relation.tipe ↔ relasi ArchiMate. */
export const EAW_TO_ARCHI: Record<string, string> = { serving: 'serving', 'used-by': 'serving', association: 'association', composition: 'composition', realization: 'realization', access: 'access', assignment: 'assignment', flow: 'flow', triggering: 'triggering' };
export const ARCHI_TO_EAW: Record<string, string> = { serving: 'serving', association: 'association', composition: 'composition', realization: 'realization', access: 'access', assignment: 'assignment', flow: 'flow', triggering: 'triggering' };

export interface DNode { id: string; type: string; label: string; x: number; y: number; objectType?: string; objectId?: string }
export interface DEdge { id: string; source: string; target: string; type: string; relationId?: string }
export interface Content { nodes: DNode[]; edges: DEdge[] }
export interface Validation { errors: string[]; warnings: string[] }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (m: string) => new ProblemException(400, 'bad-request', 'Isi diagram tidak valid', m);

/** Validasi struktural (galat → 400, tidak disimpan). Mengembalikan konten yang dinormalkan. */
export function normalize(raw: any): Content {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) throw bad('content harus {nodes:[], edges:[]}');
  if (raw.nodes.length > 500 || raw.edges.length > 1000) throw bad('maksimal 500 node dan 1000 relasi per diagram');
  const ids = new Set<string>();
  const nodes: DNode[] = raw.nodes.map((n: any, i: number) => {
    if (!n || typeof n.id !== 'string' || !/^[\w.-]{1,40}$/.test(n.id)) throw bad(`node[${i}].id wajib string (A-Z a-z 0-9 _ . -, maks 40)`);
    if (ids.has(n.id)) throw bad(`id node ganda: ${n.id}`); ids.add(n.id);
    if (!(n.type in ELEMENTS)) throw bad(`node ${n.id}: tipe elemen tidak dikenal (${n.type})`);
    if (typeof n.label !== 'string' || !n.label.trim() || n.label.length > 120) throw bad(`node ${n.id}: label wajib (maks 120 karakter)`);
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y) || Math.abs(n.x) > 20000 || Math.abs(n.y) > 20000) throw bad(`node ${n.id}: koordinat tidak valid`);
    const out: DNode = { id: n.id, type: n.type, label: n.label.trim(), x: Math.round(n.x), y: Math.round(n.y) };
    if (n.objectType !== undefined || n.objectId !== undefined) {
      if (!(n.objectType in BINDABLE) || typeof n.objectId !== 'string' || !UUID.test(n.objectId)) throw bad(`node ${n.id}: pengikatan objek tidak valid`);
      if (!BINDABLE[n.objectType].includes(n.type)) throw bad(`node ${n.id}: elemen ${n.type} tidak dapat mewakili ${n.objectType} (boleh: ${BINDABLE[n.objectType].join(', ')})`);
      out.objectType = n.objectType; out.objectId = n.objectId;
    }
    return out;
  });
  const eids = new Set<string>();
  const edges: DEdge[] = raw.edges.map((e: any, i: number) => {
    if (!e || typeof e.id !== 'string' || !/^[\w.-]{1,40}$/.test(e.id)) throw bad(`edge[${i}].id wajib string`);
    if (eids.has(e.id)) throw bad(`id relasi ganda: ${e.id}`); eids.add(e.id);
    if (!ids.has(e.source) || !ids.has(e.target)) throw bad(`relasi ${e.id}: source/target bukan node diagram`);
    if (e.source === e.target) throw bad(`relasi ${e.id}: relasi ke diri sendiri`);
    if (!(RELATIONS as readonly string[]).includes(e.type)) throw bad(`relasi ${e.id}: tipe relasi tidak dikenal (${e.type})`);
    const out: DEdge = { id: e.id, source: e.source, target: e.target, type: e.type };
    if (e.relationId !== undefined) { if (typeof e.relationId !== 'string' || !UUID.test(e.relationId)) throw bad(`relasi ${e.id}: relationId tidak valid`); out.relationId = e.relationId; }
    return out;
  });
  return { nodes, edges };
}

const ORDER = { t: 0, p: 0, a: 1, b: 2, s: 3, m: 4, i: 4 } as Record<string, number>;
/** Validasi metamodel (peringatan, tidak memblokir simpan): subset aturan ArchiMate 3.2 yang dapat diperiksa tanpa matriks derivasi penuh. */
export function validate(c: Content): Validation {
  const errors: string[] = []; const warnings: string[] = []; const byId = new Map(c.nodes.map((n) => [n.id, n]));
  for (const n of c.nodes) if (!c.edges.some((e) => e.source === n.id || e.target === n.id)) warnings.push(`Elemen "${n.label}" (${ELEMENTS[n.type].label}) tidak memiliki relasi (AC-3).`);
  for (const e of c.edges) {
    const s = byId.get(e.source)!, t = byId.get(e.target)!; const es = ELEMENTS[s.type], et = ELEMENTS[t.type]; const nm = `${s.label} —${e.type}→ ${t.label}`;
    if (e.type === 'access' && et.kind !== 'passive') warnings.push(`${nm}: access harus menuju objek pasif (Business/Data Object, Artifact).`);
    if (e.type === 'assignment' && es.kind !== 'active') warnings.push(`${nm}: assignment harus berasal dari elemen struktur aktif.`);
    if ((e.type === 'composition' || e.type === 'aggregation' || e.type === 'specialization') && es.layer !== et.layer) warnings.push(`${nm}: ${e.type} hanya antar-elemen sejenis pada layer yang sama.`);
    if ((e.type === 'triggering' || e.type === 'flow') && (es.kind !== 'behavior' || et.kind !== 'behavior')) warnings.push(`${nm}: ${e.type} menghubungkan elemen perilaku.`);
    if ((e.type === 'serving' || e.type === 'realization') && ORDER[es.layer] !== undefined && ORDER[et.layer] !== undefined && ORDER[es.layer] > ORDER[et.layer] && es.layer !== 'm' && et.layer !== 'm')
      warnings.push(`${nm}: ${e.type} mengalir dari layer bawah ke atas (Technology → Application → Business).`);
  }
  return { errors, warnings };
}

// ---------------------------------------------------------------- render SVG ----------------------------------------------------------------
const LAYER_COLOR: Record<string, string> = { s: '#F5DEAA', b: '#FFFFB5', a: '#B5FFFF', t: '#C9E7B7', p: '#C9E7B7', m: '#CCCCFF', i: '#FFE0E0' };
const x = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
export const NODE_W = 150, NODE_H = 50;
export function toSvg(c: Content, title = ''): string {
  const pad = 30; const xs = c.nodes.map((n) => n.x), ys = c.nodes.map((n) => n.y);
  const minX = Math.min(0, ...xs) - pad, minY = Math.min(0, ...ys) - pad, maxX = Math.max(400, ...xs.map((v) => v + NODE_W)) + pad, maxY = Math.max(200, ...ys.map((v) => v + NODE_H)) + pad;
  const byId = new Map(c.nodes.map((n) => [n.id, n]));
  const edges = c.edges.map((e) => { const a = byId.get(e.source)!, b = byId.get(e.target)!;
    return `<g><line x1="${a.x + NODE_W / 2}" y1="${a.y + NODE_H / 2}" x2="${b.x + NODE_W / 2}" y2="${b.y + NODE_H / 2}" stroke="#555" stroke-width="1.4" ${e.type === 'access' || e.type === 'flow' || e.type === 'influence' ? 'stroke-dasharray="4 3"' : ''} marker-end="url(#arr)"/>
      <text x="${(a.x + b.x + NODE_W) / 2}" y="${(a.y + b.y + NODE_H) / 2 - 4}" font-size="9" fill="#444" text-anchor="middle">${x(e.type)}</text></g>`; }).join('');
  const nodes = c.nodes.map((n) => { const el = ELEMENTS[n.type]; const rx = /Process|Service|Function|Capability/.test(n.type) ? 14 : 4;
    return `<g transform="translate(${n.x},${n.y})"><rect width="${NODE_W}" height="${NODE_H}" rx="${rx}" fill="${LAYER_COLOR[el.layer]}" stroke="#555"/><text x="8" y="14" font-size="9" fill="#555">«${x(el.label)}»</text>
      <text x="${NODE_W / 2}" y="34" font-size="12" font-weight="600" text-anchor="middle" fill="#111">${x(n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label)}</text></g>`; }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" width="${maxX - minX}" height="${maxY - minY}" font-family="Arial,sans-serif"><title>${x(title)}</title>
<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#555"/></marker></defs><rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="#fff"/>${edges}${nodes}</svg>`;
}

/** Open Group Exchange Format (ArchiMate 3.x) — model + relasi + satu view. Skema XSD tidak divalidasi di sini. */
export function toExchangeXml(c: Content, nama: string): string {
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const id = (p: string, s: string) => `id-${p}-${s}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.opengroup.org/xsd/archimate/3.0/ http://www.opengroup.org/xsd/archimate/3.1/archimate3_Diagram.xsd" identifier="id-model-saoraja">
  <name xml:lang="id">${x(nama)}</name>
  <elements>
${c.nodes.map((n) => `    <element identifier="${id('el', n.id)}" xsi:type="${n.type}"><name xml:lang="id">${x(n.label)}</name></element>`).join('\n')}
  </elements>
  <relationships>
${c.edges.map((e) => `    <relationship identifier="${id('rel', e.id)}" source="${id('el', e.source)}" target="${id('el', e.target)}" xsi:type="${cap(e.type)}"/>`).join('\n')}
  </relationships>
  <views>
    <diagrams>
      <view identifier="id-view-1" xsi:type="Diagram"><name xml:lang="id">${x(nama)}</name>
${c.nodes.map((n) => `        <node identifier="${id('vn', n.id)}" elementRef="${id('el', n.id)}" xsi:type="Element" x="${n.x}" y="${n.y}" w="${NODE_W}" h="${NODE_H}"/>`).join('\n')}
${c.edges.map((e) => `        <connection identifier="${id('vc', e.id)}" relationshipRef="${id('rel', e.id)}" xsi:type="Relationship" source="${id('vn', e.source)}" target="${id('vn', e.target)}"/>`).join('\n')}
      </view>
    </diagrams>
  </views>
</model>
`;
}
