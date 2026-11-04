#!/usr/bin/env python3
"""Membangkitkan eap/database/910_seed_gse.sql — 7 template blueprint GSE (deterministik, berversi). IDEMPOTEN.
Variabel templat: {{app_kode}} {{app_kode_lower}} {{app_nama}} {{platform}} {{workspace}} {{workspace_mode}} {{federation_scope}} {{iam_schema}} {{repo_git}} {{entity_code}}
Ini blueprint kemampuan platform, BUKAN data aplikasi (Zero Pre-Seed hanya melarang seed aplikasi/katalog)."""
import json, os

T = []
def tpl(kode, nama, kategori, stack, versi, deskripsi, files):
    T.append(dict(kode=kode, nama=nama, kategori=kategori, stack=stack, versi=versi, deskripsi=deskripsi, files=[dict(path=p, content=c) for p, c in files]))

tpl('tpl-host-shell', 'Unified App Shell Host', 'shell', 'React 19 · Vite 6 · MF 2.0 Host · Keycloak PKCE', '3.0.2',
    'Shell navigasi global, org selector, Ctrl+K, notifikasi, WorkspaceLoader. Satu shell per platform (D-01).', [
    ('apps/shell/package.json', '{\n  "name": "@{{platform_lower}}/shell",\n  "private": true,\n  "version": "0.1.0",\n  "scripts": { "dev": "vite", "build": "vite build" },\n  "dependencies": { "react": "^19.0.0", "react-dom": "^19.0.0", "@module-federation/enhanced": "^0.8.0", "oidc-client-ts": "^3.1.0" }\n}\n'),
    ('apps/shell/module-federation.config.ts', "import { createModuleFederationConfig } from '@module-federation/enhanced';\n\nexport default createModuleFederationConfig({\n  name: 'shell',\n  remotes: {},            // workspace FEDERATED_REMOTE didaftarkan dari metadata EAW (eaw.application)\n  shared: { react: { singleton: true }, 'react-dom': { singleton: true } },\n});\n"),
    ('apps/shell/src/router/WorkspaceLoader.tsx', "import React, { Suspense } from 'react';\n\n// Memuat workspace sesuai workspace_mode di EAW: FEDERATED_REMOTE (remoteEntry.js) atau INTERNAL_ROUTED (bundel lokal).\nexport const WorkspaceLoader: React.FC<{ id: string }> = ({ id }) => (\n  <Suspense fallback={<div>Memuat {id}…</div>}>\n    <div data-workspace={id} />\n  </Suspense>\n);\n"),
])
tpl('tpl-remote-spa', 'Remote SPA (FEDERATED_REMOTE)', 'frontend', 'React 19 · @module-federation/vite · Shadcn', '3.0.1',
    'Expose ./App tanpa props; konteks via shell-api; Error Boundary agar satu workspace tidak merusak shell (GSE-04).', [
    ('apps/{{app_kode_lower}}/package.json', '{\n  "name": "@{{platform_lower}}/{{app_kode_lower}}",\n  "private": true,\n  "version": "0.1.0",\n  "scripts": { "dev": "vite", "build": "vite build" },\n  "dependencies": { "react": "^19.0.0", "react-dom": "^19.0.0" }\n}\n'),
    ('apps/{{app_kode_lower}}/module-federation.config.ts', "import { createModuleFederationConfig } from '@module-federation/enhanced';\n\nexport default createModuleFederationConfig({\n  name: '{{federation_scope}}',\n  exposes: { './App': './src/App.tsx' },\n  shared: { react: { singleton: true }, 'react-dom': { singleton: true } },\n});\n"),
    ('apps/{{app_kode_lower}}/src/App.tsx', "import React from 'react';\nimport { ErrorBoundary } from './ErrorBoundary';\n\n// {{app_nama}} ({{app_kode}}) — workspace_mode: {{workspace_mode}}\nexport default function App() {\n  return (\n    <ErrorBoundary>\n      <h1>{{app_nama}}</h1>\n    </ErrorBoundary>\n  );\n}\n"),
    ('apps/{{app_kode_lower}}/src/ErrorBoundary.tsx', "import React from 'react';\n\nexport class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {\n  state = { failed: false };\n  static getDerivedStateFromError() { return { failed: true }; }\n  render() { return this.state.failed ? <div role=\"alert\">Workspace {{app_kode}} gagal dimuat.</div> : this.props.children; }\n}\n"),
])
tpl('tpl-internal-sub', 'Internal Routed Sub-App', 'frontend', 'React Router · Tailwind 4', '2.4.0',
    'Dibundel di repo shell; cocok untuk SET/RBAC dan pelaporan ringkas (INTERNAL_ROUTED).', [
    ('apps/shell/src/workspaces/{{app_kode_lower}}/index.tsx', "import React from 'react';\n\n// {{app_nama}} ({{app_kode}}) — INTERNAL_ROUTED, dibundel di shell {{platform}}\nexport default function {{app_kode_pascal}}Workspace() {\n  return <section><h1>{{app_nama}}</h1></section>;\n}\n"),
])
tpl('tpl-nest-clean', 'NestJS Clean Architecture', 'backend', 'NestJS 11 · pg · RFC 9457 · OpenAPI 3.1', '2.8.3',
    'Controller → Service → Repository; guard RBAC skema set; galat RFC 9457; kontrak OpenAPI 3.1.', [
    ('services/{{app_kode_lower}}-api/package.json', '{\n  "name": "{{app_kode_lower}}-api",\n  "private": true,\n  "version": "0.1.0",\n  "scripts": { "build": "tsc -p tsconfig.build.json", "start": "node dist/main.js" },\n  "dependencies": { "@nestjs/common": "^11.0.0", "@nestjs/core": "^11.0.0", "@nestjs/platform-express": "^11.0.0", "pg": "^8.13.0", "jose": "^6.0.0" }\n}\n'),
    ('services/{{app_kode_lower}}-api/src/main.ts', "import { NestFactory } from '@nestjs/core';\nimport { AppModule } from './app.module';\n\nasync function bootstrap() {\n  const app = await NestFactory.create(AppModule);\n  await app.listen(Number(process.env.PORT ?? 3000));\n}\nbootstrap();\n"),
    ('services/{{app_kode_lower}}-api/src/app.module.ts', "import { Controller, Get, Module } from '@nestjs/common';\n\n@Controller('health')\nclass HealthController { @Get() ok() { return { service: '{{app_kode_lower}}-api', status: 'ok' }; } }\n\n// Autentikasi: JWT Keycloak (RS256/ES256 via JWKS, D-13); otorisasi: skema {{iam_schema}} (D-12)\n@Module({ controllers: [HealthController] })\nexport class AppModule {}\n"),
    ('services/{{app_kode_lower}}-api/openapi.json', '{\n  "openapi": "3.1.0",\n  "info": { "title": "{{app_nama}} API", "version": "0.1.0" },\n  "paths": { "/health": { "get": { "responses": { "200": { "description": "OK" } } } } }\n}\n'),
])
tpl('tpl-go-fiber', 'Go Fiber Service', 'backend', 'Go 1.25 · Fiber · OTel', '1.9.0',
    'Layanan latensi rendah; konektor EIO.', [
    ('services/{{app_kode_lower}}-svc/go.mod', 'module kalla/{{app_kode_lower}}-svc\n\ngo 1.25\n\nrequire github.com/gofiber/fiber/v2 v2.52.5\n'),
    ('services/{{app_kode_lower}}-svc/main.go', 'package main\n\nimport "github.com/gofiber/fiber/v2"\n\nfunc main() {\n\tapp := fiber.New()\n\tapp.Get("/health", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"service": "{{app_kode_lower}}-svc", "status": "ok"}) })\n\t_ = app.Listen(":3000")\n}\n'),
])
tpl('tpl-ddl-set', 'DDL Skema set + shared + ref', 'ddl', 'PostgreSQL 18 · {{iam_schema}}', '3.1.0',
    'Skema RBAC seragam D-12 (tanpa PII, D-14), modul shared identik, langganan pub_cmp_ref.', [
    ('db/migrations/0001_init_schemas.sql', '-- {{app_nama}} ({{app_kode}})\nCREATE SCHEMA IF NOT EXISTS {{iam_schema}};\nCREATE SCHEMA IF NOT EXISTS shared;   -- identik lintas platform KEIS (ADR-CMP-004)\nCREATE SCHEMA IF NOT EXISTS ref;      -- replika read-only dari CMP (pub_cmp_ref)\n'),
    ('db/migrations/0002_set_users.sql', '-- D-14: DILARANG menyimpan PII di tabel ini; hanya idp_subject.\nCREATE TABLE {{iam_schema}}.users (\n  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  idp_subject  VARCHAR(200) NOT NULL UNIQUE,\n  is_active    BOOLEAN NOT NULL DEFAULT TRUE,\n  last_login_at TIMESTAMPTZ,\n  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()\n);\n'),
])
tpl('tpl-ci', 'Pipeline CI GitOps', 'ci', 'Lint · Build · Grype · Syft · pii-guard · cross_check', '2.2.0',
    '7 tahap CI + sinkronisasi ArgoCD per platform. Tahap dijalankan CI runner; GSE hanya membangkitkan manifestnya.', [
    ('.ci/pipeline.yaml', 'stages:\n  - lint\n  - build\n  - sca          # Grype + ORT: 0 copyleft viral\n  - sbom         # Syft: SPDX 2.3\n  - pii-guard    # blokir kolom email/full_name/nik/phone/address\n  - cross-check  # shared & ref identik dengan CMP\n  - test\nrepository: {{repo_git}}\nbranch_policy: pull-request-only   # D-02: 0 push langsung ke main\n'),
])

lines = ['-- =====================================================================',
         '-- 910_seed_gse.sql : template blueprint GSE (DIBANGKITKAN scripts/gen_seed_gse.py — jangan sunting manual). IDEMPOTEN (ON CONFLICT DO NOTHING).',
         '-- =====================================================================']
for t in T:
    files = json.dumps(t['files'], ensure_ascii=False)
    assert '$tpl$' not in files
    lines.append("INSERT INTO gse.template (kode, nama, kategori, stack, versi, deskripsi, files) VALUES (%s, %s, %s, %s, %s, %s, $tpl$%s$tpl$::jsonb)\n  ON CONFLICT (kode) WHERE deleted_at IS NULL DO NOTHING;" % tuple(
        ["'" + x.replace("'", "''") + "'" for x in (t['kode'], t['nama'], t['kategori'], t['stack'], t['versi'], t['deskripsi'])] + [files]))
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'database', '910_seed_gse.sql')
open(path, 'w', encoding='utf8', newline='\n').write('\n'.join(lines) + '\n')
print('ok:', len(T), 'template')
