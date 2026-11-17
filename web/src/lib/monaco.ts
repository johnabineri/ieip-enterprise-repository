/* Pemuat Monaco Editor 0.52.0 dari cdnjs (tanpa bundel npm: berat dan butuh konfigurasi worker). Bila CDN tidak terjangkau, pemanggil jatuh ke <textarea>.
   Worker lintas-asal dibungkus blob same-origin yang importScripts dari CDN. baseUrl worker = folder INDUK "vs" (…/min/), BUKAN …/min/vs/ — salah satu tingkat
   membuat worker bahasa (tsWorker) dicari di …/vs/vs/… dan gagal (terbukti 2026-11-05 di UI lama). */
const VS = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.0/min/vs';

let loading: Promise<any> | null = null;
export function loadMonaco(): Promise<any> {
  const w = window as any;
  if (w.monaco) return Promise.resolve(w.monaco);
  if (loading) return loading;
  loading = new Promise((ok, no) => {
    const min = VS.replace(/\/vs$/, '');
    w.MonacoEnvironment = { getWorkerUrl: () => URL.createObjectURL(new Blob([`self.MonacoEnvironment={baseUrl:'${min}/'};importScripts('${VS}/base/worker/workerMain.js');`], { type: 'text/javascript' })) };
    const s = document.createElement('script'); s.src = `${VS}/loader.min.js`; s.crossOrigin = 'anonymous';
    s.onload = () => { w.require.config({ paths: { vs: VS } }); w.require(['vs/editor/editor.main'], () => ok(w.monaco), no); };
    s.onerror = () => no(new Error('Monaco tidak dapat dimuat dari CDN'));
    document.head.appendChild(s);
  }).catch((e) => { loading = null; throw e; });
  return loading;
}
