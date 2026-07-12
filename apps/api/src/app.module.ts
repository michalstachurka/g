import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaService } from './prisma.service';
import { StorageService } from './storage/storage.service';
import { QueueService } from './services/queue.service';
import { AuditService } from './services/audit.service';
import { PublicService } from './services/public.service';
import { EvaluateService } from './domain/evaluate.service';
import { AuthController } from './controllers/auth.controller';
import { PublicController } from './controllers/public.controller';
import { FilesController } from './controllers/files.controller';
import { InternalController } from './controllers/internal.controller';
import { AdminBrandingController } from './controllers/admin-branding.controller';
import { AdminCatalogController } from './controllers/admin-catalog.controller';
import { AdminAssetsController } from './controllers/admin-assets.controller';
import { AdminVersionedController } from './controllers/admin-versioned.controller';
import { AdminOperationsController } from './controllers/admin-operations.controller';
import { AdminAuthGuard, WorkerAuthGuard } from './common/auth';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', limit: 300, ttl: 60_000 }],
    }),
  ],
  controllers: [
    AuthController,
    PublicController,
    FilesController,
    InternalController,
    AdminBrandingController,
    AdminCatalogController,
    AdminAssetsController,
    AdminVersionedController,
    AdminOperationsController,
  ],
  providers: [
    PrismaService,
    StorageService,
    QueueService,
    AuditService,
    PublicService,
    EvaluateService,
    AdminAuthGuard,
    WorkerAuthGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
