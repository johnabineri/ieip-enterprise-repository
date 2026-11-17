import { Module, OnModuleInit, Type, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE, HttpAdapterHost } from '@nestjs/core';
import { AuditController } from './audit/audit.controller';
import { AuthGuard } from './auth/auth';
import { NoStoreInterceptor } from './common/no-store';
import { installFastifyHooks } from './common/fastify';
import { ProblemFilter } from './common/problem';
import { DbModule } from './db/db.module';
import { ApplicationsController } from './eaw/applications.controller';
import { AdrsController, EntityOrgController, ReferencesController } from './eaw/org-reference-adr.controller';
import { ImportController } from './eaw/import.controller';
import { LineageController } from './eaw/lineage.controller';
import { PublisherController } from './eaw/publisher.controller';
import { DiagramsController } from './eaw/diagrams.controller';
import { DashboardController } from './eaw/dashboard.controller';
import { EcosystemController } from './eaw/ecosystem.controller';
import { RepositoryController } from './eaw/repository.controller';
import { ObjectsController, ReadinessController } from './eaw/objects.controller';
import { RelationsController } from './eaw/relations.controller';
import { WorkflowController } from './eaw/workflow.controller';
import { ArbController } from './gov/arb.controller';
import { ConsoleController } from './console/console.controller';
import { MetricsController } from './console/metrics';
import { ReqController } from './req/req.controller';
import { RoadmapController } from './eaw/roadmap.controller';
import { GseController } from './gse/gse.controller';
import { GseGitController } from './gse/git.controller';
import { GseWorkspaceController } from './gse/workspace.controller';
import { GseSagaController } from './gse/saga.controller';
import { GseSagaService } from './gse/saga.service';
import { EioController } from './console/eio.controller';
import { HealthController } from './health/health.controller';
import { MeController } from './me/me.controller';
import { SetController } from './set/set.controller';
import { IntegrationsController } from './set/integrations.controller';

/**
 * Pemecahan microservices PER WORKSPACE (satu codebase, satu image, satu titik masuk per layanan lewat env SERVICE). Batas layanan mengikuti batas workspace:
 *   eaw     : /api/v1/eaw/**  + /api/v1/gov/**        (katalog, 6 domain, relasi, KRA, ADR, ARB, kanvas, penerbit, impor, roadmap, lineage)
 *   gse     : /api/v1/gse/**                         (scaffolding, flow, konektor Git/CI)
 *   req     : /api/v1/req/**                         (elisitasi kebutuhan AI)
 *   console : /api/v1/console/**                     (IKA, FinOps, EIO, AI governance, observabilitas)
 *   set     : /api/v1/set/**, /api/v1/audit/**, /api/v1/me  (identitas, peran, audit)
 *   all     : monolit (pengembangan lokal & tes e2e)
 * Setiap layanan juga punya /health dan /metrics (tidak dirutekan gateway). Kontrak API ke luar TIDAK berubah: gateway merutekan awalan path.
 */
export const SERVICE_NAMES = ['eaw', 'gse', 'req', 'console', 'set', 'all'] as const;
export type ServiceName = (typeof SERVICE_NAMES)[number];

const EAW: Type[] = [EntityOrgController, ApplicationsController, WorkflowController, ObjectsController, ReadinessController, RelationsController, DashboardController, EcosystemController, RepositoryController, DiagramsController,
  PublisherController, LineageController, ImportController, RoadmapController, ReferencesController, AdrsController, ArbController];
const GSE: Type[] = [GseController, GseGitController, GseWorkspaceController, GseSagaController];
const REQ: Type[] = [ReqController];
const CONSOLE: Type[] = [ConsoleController, EioController];
const SET: Type[] = [MeController, SetController, IntegrationsController, AuditController];
export const SERVICE_CONTROLLERS: Record<ServiceName, Type[]> = { eaw: EAW, gse: GSE, req: REQ, console: CONSOLE, set: SET, all: [...EAW, ...GSE, ...REQ, ...CONSOLE, ...SET] };

export function appModuleFor(service: ServiceName): Type {
  @Module({
    imports: [DbModule],
    controllers: [HealthController, MetricsController, ...SERVICE_CONTROLLERS[service]],
    providers: [
      GseSagaService,                                   // mesin saga: GSE (/gse/flows/:id/runs) + EIO L5 (/console/eio/routes/:kode/mediate)
      { provide: APP_GUARD, useClass: AuthGuard },
      { provide: APP_FILTER, useClass: ProblemFilter },
      { provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor },
      { provide: APP_PIPE, useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: false }) },
    ],
  })
  class ServiceModule implements OnModuleInit {
    constructor(private readonly host: HttpAdapterHost) {}
    onModuleInit() { installFastifyHooks(this.host.httpAdapter.getInstance()); }   // header keamanan + metrik (sebelum ready())
  }
  Object.defineProperty(ServiceModule, 'name', { value: `AppModule_${service}` });
  return ServiceModule;
}

/** Monolit (semua workspace) — dipakai tes e2e dan pengembangan lokal. */
export const AppModule = appModuleFor('all');
