/**
 * OpenTelemetry (trace) — AKTIF hanya bila OTEL_EXPORTER_OTLP_ENDPOINT diisi (mis. http://otel-collector:4318). Tanpa itu modul ini tidak berbuat apa pun
 * (tes dan pengembangan lokal tidak berubah). Harus diimpor PALING AWAL di main.ts agar http/express/pg ter-instrumentasi.
 * Nama layanan: OTEL_SERVICE_NAME, bawaan "eap-<SERVICE>". Konteks trace diteruskan dari gateway lewat header W3C traceparent.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';

let sdk: NodeSDK | null = null;
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
if (endpoint) {
  process.env.OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? `eap-${process.env.SERVICE ?? 'all'}`;
  sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` }),
    instrumentations: [
      new HttpInstrumentation({ ignoreIncomingRequestHook: (r) => /^\/(health|metrics)/.test(r.url ?? '') }),
      new ExpressInstrumentation(), new PgInstrumentation({ enhancedDatabaseReporting: false }),   // tanpa nilai parameter SQL di span (hindari data sensitif)
    ],
  });
  sdk.start();
  const stop = () => { void sdk?.shutdown().catch(() => undefined); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
}
export const telemetryEnabled = !!sdk;
