import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import * as QRCode from 'qrcode';
import { evaluateRequestSchema, publicAssetManifestSchema } from '@door/contracts';
import { PrismaService } from '../prisma.service';
import { PublicService } from '../services/public.service';
import { EvaluateService } from '../domain/evaluate.service';
import { QueueService } from '../services/queue.service';
import { StorageService } from '../storage/storage.service';
import { publicId, randomToken, signPayload, verifyPayload } from '../common/utils';

const saveConfigurationSchema = z.object({
  request: evaluateRequestSchema,
  name: z.string().max(200).nullable().optional(),
  customerNote: z.string().max(4000).nullable().optional(),
  measurements: z.record(z.string(), z.unknown()).nullable().optional(),
  shareId: z.string().max(60).nullable().optional(),
});

const leadSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().email().max(200).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  postalCode: z.string().max(12).nullable().optional(),
  preferredDate: z.string().max(60).nullable().optional(),
  message: z.string().max(4000).nullable().optional(),
  consent: z.literal(true, { errorMap: () => ({ message: 'Zgoda jest wymagana.' }) }),
  configurationShareId: z.string().max(60).nullable().optional(),
});

@Controller('public/:slug')
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class PublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publicService: PublicService,
    private readonly evaluateService: EvaluateService,
    private readonly queue: QueueService,
    private readonly storage: StorageService,
  ) {}

  @Get('branding')
  getBranding(@Param('slug') slug: string) {
    return this.publicService.getBranding(slug);
  }

  @Get('categories')
  getCategories(@Param('slug') slug: string) {
    return this.publicService.getCategories(slug);
  }

  @Get('schema/:categoryKey')
  getSchema(@Param('slug') slug: string, @Param('categoryKey') categoryKey: string) {
    return this.publicService.getSchema(slug, categoryKey);
  }

  @Get('materials')
  getMaterials(@Param('slug') slug: string) {
    return this.publicService.getMaterials(slug);
  }

  @Post('evaluate')
  @HttpCode(200)
  async evaluate(@Param('slug') slug: string, @Body() body: unknown) {
    const request = evaluateRequestSchema.parse(body);
    const result = await this.evaluateService.evaluate(slug, request);
    return result.response;
  }

  /** Zapis zawsze ponownie uruchamia evaluate - nie ufamy stanowi klienta. */
  @Post('configurations')
  @HttpCode(200)
  async saveConfiguration(@Param('slug') slug: string, @Body() body: unknown) {
    const input = saveConfigurationSchema.parse(body);
    const tenant = await this.publicService.getTenantOrThrow(slug);
    const evaluation = await this.evaluateService.evaluate(slug, input.request);

    let configuration =
      input.shareId != null
        ? await this.prisma.configuration.findFirst({
            where: { tenantId: tenant.id, shareId: input.shareId },
          })
        : null;

    if (configuration) {
      configuration = await this.prisma.configuration.update({
        where: { id: configuration.id },
        data: {
          categoryKey: input.request.categoryKey,
          modelKey: input.request.modelKey ?? null,
          selections: evaluation.normalizedSelections as object,
          revision: configuration.revision + 1,
          status: 'saved',
          name: input.name ?? configuration.name,
          customerNote: input.customerNote ?? configuration.customerNote,
          measurements: (input.measurements ?? configuration.measurements) as object,
        },
      });
    } else {
      configuration = await this.prisma.configuration.create({
        data: {
          tenantId: tenant.id,
          shareId: randomToken(9),
          categoryKey: input.request.categoryKey,
          modelKey: input.request.modelKey ?? null,
          selections: evaluation.normalizedSelections as object,
          revision: 1,
          status: 'saved',
          name: input.name ?? null,
          customerNote: input.customerNote ?? null,
          measurements: (input.measurements ?? null) as object,
        },
      });
    }

    const snapshot = await this.prisma.configurationSnapshot.create({
      data: {
        configurationId: configuration.id,
        revision: configuration.revision,
        selections: evaluation.normalizedSelections as object,
        evaluateResult: evaluation.response as unknown as object,
        renderSpec: (evaluation.response.renderSpec ?? null) as object,
        priceBreakdown: (evaluation.pricing ?? null) as unknown as object,
        versions: evaluation.response.versions as object,
        checksum: evaluation.response.checksum,
      },
    });

    return {
      shareId: configuration.shareId,
      revision: configuration.revision,
      snapshotId: snapshot.id,
      evaluate: evaluation.response,
    };
  }

  @Get('configurations/:shareId')
  async getConfiguration(@Param('slug') slug: string, @Param('shareId') shareId: string) {
    const tenant = await this.publicService.getTenantOrThrow(slug);
    const configuration = await this.prisma.configuration.findFirst({
      where: { tenantId: tenant.id, shareId },
      include: { snapshots: { orderBy: { revision: 'desc' }, take: 1 } },
    });
    if (!configuration) throw new NotFoundException('Konfiguracja nie istnieje.');
    const snapshot = configuration.snapshots[0] ?? null;
    return {
      shareId: configuration.shareId,
      categoryKey: configuration.categoryKey,
      modelKey: configuration.modelKey,
      name: configuration.name,
      selections: configuration.selections,
      revision: configuration.revision,
      createdAt: configuration.createdAt,
      updatedAt: configuration.updatedAt,
      evaluate: snapshot?.evaluateResult ?? null,
    };
  }

  /** Publiczne zlecenie dokumentu - wyłącznie specyfikacja klienta. */
  @Post('configurations/:shareId/documents')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async requestDocument(@Param('slug') slug: string, @Param('shareId') shareId: string) {
    const tenant = await this.publicService.getTenantOrThrow(slug);
    const configuration = await this.prisma.configuration.findFirst({
      where: { tenantId: tenant.id, shareId },
      include: { snapshots: { orderBy: { revision: 'desc' }, take: 1 } },
    });
    const snapshot = configuration?.snapshots[0];
    if (!configuration || !snapshot) throw new NotFoundException('Konfiguracja nie istnieje.');

    const idempotencyKey = `doc:customer_specification:${snapshot.id}`;
    const existing = await this.prisma.generatedDocument.findUnique({ where: { idempotencyKey } });
    if (existing && existing.status !== 'failed') {
      return { documentId: existing.id, status: existing.status };
    }
    const document = existing
      ? await this.prisma.generatedDocument.update({
          where: { id: existing.id },
          data: { status: 'queued', error: null },
        })
      : await this.prisma.generatedDocument.create({
          data: {
            tenantId: tenant.id,
            snapshotId: snapshot.id,
            kind: 'customer_specification',
            idempotencyKey,
          },
        });
    await this.queue.enqueue('document.generate', { documentId: document.id });
    return { documentId: document.id, status: document.status };
  }

  @Get('documents/:id')
  async documentStatus(@Param('slug') slug: string, @Param('id') id: string) {
    const tenant = await this.publicService.getTenantOrThrow(slug);
    const document = await this.prisma.generatedDocument.findFirst({
      where: { id, tenantId: tenant.id, kind: 'customer_specification' },
    });
    if (!document) throw new NotFoundException('Dokument nie istnieje.');
    return {
      id: document.id,
      status: document.status,
      error: document.error,
      downloadUrl:
        document.status === 'done'
          ? `/files/documents/${signPayload({ d: document.id }, 3600)}`
          : null,
    };
  }

  /** Zlecenie modeli AR (GLB + USDZ) dla zapisanej konfiguracji. */
  @Post('configurations/:shareId/ar')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async requestArModels(@Param('slug') slug: string, @Param('shareId') shareId: string) {
    const tenant = await this.publicService.getTenantOrThrow(slug);
    const configuration = await this.prisma.configuration.findFirst({
      where: { tenantId: tenant.id, shareId },
      include: { snapshots: { orderBy: { revision: 'desc' }, take: 1 } },
    });
    const snapshot = configuration?.snapshots[0];
    if (!configuration || !snapshot) throw new NotFoundException('Konfiguracja nie istnieje.');
    if (!snapshot.renderSpec) {
      throw new BadRequestException(
        'Ta konfiguracja nie ma wizualizacji (brak opublikowanego assetu), więc model AR nie może powstać.',
      );
    }

    const jobs: { kind: string; id: string; status: string }[] = [];
    for (const kind of ['glb', 'usdz'] as const) {
      const idempotencyKey = `model:${kind}:${snapshot.id}`;
      let record = await this.prisma.generatedModel.findUnique({ where: { idempotencyKey } });
      if (!record || record.status === 'failed') {
        record = record
          ? await this.prisma.generatedModel.update({
              where: { id: record.id },
              data: { status: 'queued', error: null },
            })
          : await this.prisma.generatedModel.create({
              data: {
                tenantId: tenant.id,
                snapshotId: snapshot.id,
                kind,
                idempotencyKey,
                publicToken: publicId('mdl'),
              },
            });
        await this.queue.enqueue('model.export', { modelId: record.id });
      }
      jobs.push({ kind, id: record.id, status: record.status });
    }
    return { jobs };
  }

  @Get('configurations/:shareId/ar')
  async arStatus(@Param('slug') slug: string, @Param('shareId') shareId: string) {
    const tenant = await this.publicService.getTenantOrThrow(slug);
    const configuration = await this.prisma.configuration.findFirst({
      where: { tenantId: tenant.id, shareId },
      include: { snapshots: { orderBy: { revision: 'desc' }, take: 1 } },
    });
    const snapshot = configuration?.snapshots[0];
    if (!configuration || !snapshot) throw new NotFoundException('Konfiguracja nie istnieje.');
    const models = await this.prisma.generatedModel.findMany({ where: { snapshotId: snapshot.id } });
    const byKind = (kind: string) => models.find((m) => m.kind === kind) ?? null;
    const glb = byKind('glb');
    const usdz = byKind('usdz');
    return {
      glb: glb
        ? { status: glb.status, url: glb.status === 'done' ? `/files/models/${glb.publicToken}` : null, error: glb.error }
        : null,
      usdz: usdz
        ? { status: usdz.status, url: usdz.status === 'done' ? `/files/models/${usdz.publicToken}` : null, error: usdz.error }
        : null,
    };
  }

  /** Publiczny manifest assetu dla viewera (bez ścieżek storage). */
  @Get('assets/:publicAssetId/manifest')
  @Header('Cache-Control', 'public, max-age=300')
  async assetManifest(@Param('slug') slug: string, @Param('publicAssetId') publicAssetId: string) {
    const tenant = await this.publicService.getTenantOrThrow(slug);
    const version = await this.prisma.assetVersion.findFirst({
      where: { publicAssetId, status: 'published', asset: { tenantId: tenant.id } },
    });
    if (!version || !version.manifest) throw new NotFoundException('Asset nie istnieje.');
    return {
      publicAssetId,
      manifest: publicAssetManifestSchema.parse(version.manifest),
      fileUrl: `/public/${slug}/assets/${publicAssetId}/file`,
    };
  }

  @Get('assets/:publicAssetId/file')
  async assetFile(
    @Param('slug') slug: string,
    @Param('publicAssetId') publicAssetId: string,
    @Res() res: Response,
  ) {
    const tenant = await this.publicService.getTenantOrThrow(slug);
    const version = await this.prisma.assetVersion.findFirst({
      where: { publicAssetId, status: 'published', asset: { tenantId: tenant.id } },
    });
    if (!version || !version.publicStoragePath) throw new NotFoundException('Asset nie istnieje.');
    res.setHeader('Content-Type', 'model/gltf-binary');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', `"${version.checksum}"`);
    this.storage.stream(version.publicStoragePath).pipe(res);
  }

  /** QR wyłącznie do kanonicznych ścieżek tej aplikacji. */
  @Get('qr.png')
  async qr(@Param('slug') slug: string, @Query('path') path: string, @Res() res: Response) {
    await this.publicService.getTenantOrThrow(slug);
    if (!path || !path.startsWith('/')) throw new BadRequestException('Nieprawidłowa ścieżka QR.');
    const base = process.env.CONFIGURATOR_URL ?? 'http://localhost:3000';
    const png = await QRCode.toBuffer(`${base}${path}`, { width: 480, margin: 1 });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(png);
  }

  @Post('leads')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async createLead(@Param('slug') slug: string, @Body() body: unknown) {
    const input = leadSchema.parse(body);
    const tenant = await this.publicService.getTenantOrThrow(slug);
    const configuration = input.configurationShareId
      ? await this.prisma.configuration.findFirst({
          where: { tenantId: tenant.id, shareId: input.configurationShareId },
        })
      : null;
    const lead = await this.prisma.lead.create({
      data: {
        tenantId: tenant.id,
        configurationId: configuration?.id ?? null,
        customer: {
          name: input.name,
          email: input.email ?? null,
          phone: input.phone ?? null,
          postalCode: input.postalCode ?? null,
          preferredDate: input.preferredDate ?? null,
          consent: true,
        },
        message: input.message ?? null,
      },
    });
    return { leadId: lead.id, message: 'Dziękujemy. Skontaktujemy się w sprawie wyceny.' };
  }

  /** Wysyłka konfiguracji mailem przez backend (driver logujący w dev). */
  @Post('configurations/:shareId/email')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async emailConfiguration(
    @Param('slug') slug: string,
    @Param('shareId') shareId: string,
    @Body() body: unknown,
  ) {
    const { to } = z.object({ to: z.string().email() }).parse(body);
    const tenant = await this.publicService.getTenantOrThrow(slug);
    const configuration = await this.prisma.configuration.findFirst({
      where: { tenantId: tenant.id, shareId },
    });
    if (!configuration) throw new NotFoundException('Konfiguracja nie istnieje.');
    const base = process.env.CONFIGURATOR_URL ?? 'http://localhost:3000';
    await this.prisma.emailLog.create({
      data: {
        tenantId: tenant.id,
        to,
        subject: `Twoja konfiguracja drzwi - ${tenant.companyName}`,
        body: `Link do zapisanej konfiguracji: ${base}/${slug}/c/${shareId}`,
        status: process.env.SMTP_URL ? 'sent' : 'logged',
      },
    });
    return { ok: true, delivery: process.env.SMTP_URL ? 'sent' : 'logged' };
  }
}

export function verifyDocumentToken(token: string): string | null {
  const payload = verifyPayload(token);
  const id = payload?.d;
  return typeof id === 'string' ? id : null;
}
