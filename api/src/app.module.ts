import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AuditController } from './audit/audit.controller';
import { AuthGuard } from './auth/auth';
import { NoStoreInterceptor } from './common/no-store';
import { ProblemFilter } from './common/problem';
import { DbModule } from './db/db.module';
import { ApplicationsController } from './eaw/applications.controller';
import { AdrsController, EntityOrgController, ReferencesController } from './eaw/org-reference-adr.controller';
import { ImportController } from './eaw/import.controller';
import { LineageController } from './eaw/lineage.controller';
import { PublisherController } from './eaw/publisher.controller';
import { DiagramsController } from './eaw/diagrams.controller';
import { DashboardController } from './eaw/dashboard.controller';
import { ObjectsController, ReadinessController } from './eaw/objects.controller';
import { RelationsController } from './eaw/relations.controller';
import { WorkflowController } from './eaw/workflow.controller';
import { ArbController } from './gov/arb.controller';
import { ConsoleController } from './console/console.controller';
import { MetricsInterceptor } from './console/metrics';
import { ReqController } from './req/req.controller';
import { GseController } from './gse/gse.controller';
import { GseGitController } from './gse/git.controller';
import { HealthController } from './health/health.controller';
import { MeController } from './me/me.controller';
import { SetController } from './set/set.controller';

@Module({
  imports: [DbModule],
  controllers: [
    HealthController, MeController, EntityOrgController, ApplicationsController, WorkflowController, ObjectsController, ReadinessController, RelationsController, DashboardController, DiagramsController, PublisherController, LineageController, ImportController, GseController, GseGitController, ReqController, ConsoleController,
    ReferencesController, AdrsController, ArbController, SetController, AuditController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: ProblemFilter },
    { provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    { provide: APP_PIPE, useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: false }) },
  ],
})
export class AppModule {}
