import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import type { BomItemDef, RenderSpec } from '@door/contracts';
import { PrismaService } from '../prisma.service';
import { StorageService } from '../storage/storage.service';
import { WorkerAuthGuard } from '../common/auth';
import { sha256Hex } from '../common/utils';
import { computeBom, computeHingeCount } from '../domain/bom-engine';
import type { SelectionMap } from '../domain/rules-engine';

/**
 * Endpointy wyłącznie dla workera (nagłówek x-worker-token). Worker nie ma
 * własnego dostępu do bazy - pobiera zatwierdzone snapshoty i odsyła wyniki.
 */
@Controller('internal')
@UseGuards(WorkerAuthGuard)
export class InternalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get('jobs/document/:id')
  async documentJob(@Param('id') id: string) {
    const document = await this.prisma.generatedDocument.findUnique({
      where: { id },
      include: {
        snapshot: { include: { configuration: true } },
        tenant: { include: { themes: { orderBy: { version: 'desc' } } } },
      },
    });
    if (!document) throw new NotFoundException('Zadanie nie istnieje.');
    await this.prisma.generatedDocument.update({
      where: { id },
      data: { status: 'processing' },
    });

    const snapshot = document.snapshot;
    const configuration = snapshot.configuration;
    const tenant = document.tenant;
    const theme = tenant.themes.find((t) => t.status === 'published') ?? tenant.themes[0] ?? null;
    const template = await this.prisma.documentTemplate.findFirst({
      where: { tenantId: tenant.id, kind: document.kind, status: 'published' },
      orderBy: { version: 'desc' },
    });

    const evaluateResult = snapshot.evaluateResult as Record<string, unknown>;
    const shareUrl = `${process.env.CONFIGURATOR_URL ?? 'http://localhost:3000'}/${tenant.slug}/c/${configuration.shareId}`;
    const renderUrl = `${process.env.CONFIGURATOR_URL ?? 'http://localhost:3000'}/${tenant.slug}/render/${configuration.shareId}`;

    // Dane wrażliwe tylko dla dokumentów wewnętrznych.
    const isInternalKind = document.kind === 'production_bom';
    let bomLines: unknown = null;
    if (isInternalKind) {
      bomLines = await this.computeBomForSnapshot(
        tenant.id,
        configuration.modelKey,
        snapshot.selections as SelectionMap,
        snapshot.renderSpec as RenderSpec | null,
      );
    }

    return {
      id: document.id,
      kind: document.kind,
      tenant: { slug: tenant.slug, name: tenant.name, companyName: tenant.companyName },
      branding: {
        logoUrl: theme?.logoUrl ?? null,
        themeTokens: theme?.themeTokens ?? {},
        footerText: theme?.footerText ?? null,
        contact: theme?.contact ?? null,
      },
      template: template ? { version: template.version, config: template.config } : null,
      configuration: {
        shareId: configuration.shareId,
        name: configuration.name,
        categoryKey: configuration.categoryKey,
        modelKey: configuration.modelKey,
        selections: snapshot.selections,
        revision: snapshot.revision,
        createdAt: configuration.createdAt,
        customerNote: configuration.customerNote,
        measurements: configuration.measurements,
      },
      evaluate: evaluateResult,
      priceBreakdown: isInternalKind || document.kind === 'sales_quote' ? snapshot.priceBreakdown : null,
      bomLines,
      versions: snapshot.versions,
      checksum: snapshot.checksum,
      shareUrl,
      renderUrl,
      qrPath: `/${tenant.slug}/c/${configuration.shareId}`,
    };
  }

  private async computeBomForSnapshot(
    tenantId: string,
    modelKey: string | null,
    selections: SelectionMap,
    renderSpec: RenderSpec | null,
  ) {
    if (!modelKey) return [];
    const model = await this.prisma.productModel.findFirst({
      where: { tenantId, key: modelKey },
    });
    if (!model) return [];
    const recipe = await this.prisma.bomRecipe.findFirst({
      where: { tenantId, modelId: model.id, status: 'published' },
      orderBy: { version: 'desc' },
    });
    if (!recipe) return [];
    const widthMm = renderSpec?.widthMm ?? model.baseWidthMm;
    const heightMm = renderSpec?.heightMm ?? model.baseHeightMm;
    return computeBom(recipe.items as unknown as BomItemDef[], {
      widthMm,
      heightMm,
      hingeCount: computeHingeCount(heightMm),
      selections,
    });
  }

  @Post('jobs/document/:id/complete')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 30 * 1024 * 1024 } }))
  async completeDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { templateVersion?: string },
  ) {
    if (!file) throw new BadRequestException('Brak pliku.');
    const document = await this.prisma.generatedDocument.findUnique({ where: { id } });
    if (!document) throw new NotFoundException();
    const storagePath = `private/documents/${document.tenantId}/${document.id}.pdf`;
    await this.storage.put(storagePath, file.buffer);
    await this.prisma.generatedDocument.update({
      where: { id },
      data: {
        status: 'done',
        storagePath,
        checksum: sha256Hex(file.buffer),
        templateVersion: body.templateVersion ? Number(body.templateVersion) : null,
        finishedAt: new Date(),
        error: null,
      },
    });
    return { ok: true };
  }

  @Post('jobs/document/:id/fail')
  @HttpCode(200)
  async failDocument(@Param('id') id: string, @Body() body: unknown) {
    const { error } = z.object({ error: z.string().max(2000) }).parse(body);
    await this.prisma.generatedDocument.update({
      where: { id },
      data: { status: 'failed', error, finishedAt: new Date() },
    });
    return { ok: true };
  }

  @Get('jobs/model/:id')
  async modelJob(@Param('id') id: string) {
    const record = await this.prisma.generatedModel.findUnique({
      where: { id },
      include: { snapshot: { include: { configuration: true } } },
    });
    if (!record) throw new NotFoundException('Zadanie nie istnieje.');
    if (!record.snapshot.renderSpec) throw new BadRequestException('Snapshot bez renderSpec.');
    await this.prisma.generatedModel.update({ where: { id }, data: { status: 'processing' } });

    const renderSpec = record.snapshot.renderSpec as unknown as RenderSpec;
    const assetIds = [...new Set(renderSpec.modules.map((m) => m.publicAssetId))];
    const versions = await this.prisma.assetVersion.findMany({
      where: { publicAssetId: { in: assetIds }, status: 'published' },
    });
    const materials = await this.prisma.publicMaterial.findMany({
      where: { tenantId: record.tenantId },
    });
    return {
      id: record.id,
      kind: record.kind,
      renderSpec,
      materials: materials.map((m) => ({
        key: m.key,
        name: m.name,
        kind: m.kind,
        baseColorHex: m.baseColorHex,
        roughness: m.roughness,
        metalness: m.metalness,
        opacity: m.opacity,
        transmission: m.transmission,
        clearcoat: m.clearcoat,
      })),
      assets: versions.map((v) => ({
        publicAssetId: v.publicAssetId,
        manifest: v.manifest,
        fileUrl: `/internal/assets/${v.publicAssetId}/file`,
      })),
    };
  }

  @Get('assets/:publicAssetId/file')
  async assetFile(@Param('publicAssetId') publicAssetId: string, @Res() res: Response) {
    const version = await this.prisma.assetVersion.findFirst({
      where: { publicAssetId, status: 'published' },
    });
    if (!version || !version.publicStoragePath) throw new NotFoundException();
    res.setHeader('Content-Type', 'model/gltf-binary');
    this.storage.stream(version.publicStoragePath).pipe(res);
  }

  @Post('jobs/model/:id/complete')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  async completeModel(@Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Brak pliku.');
    const record = await this.prisma.generatedModel.findUnique({ where: { id } });
    if (!record) throw new NotFoundException();
    const storagePath = `public/models/${record.tenantId}/${record.id}.${record.kind}`;
    await this.storage.put(storagePath, file.buffer);
    await this.prisma.generatedModel.update({
      where: { id },
      data: {
        status: 'done',
        storagePath,
        checksum: sha256Hex(file.buffer),
        byteSize: file.buffer.length,
        finishedAt: new Date(),
        error: null,
      },
    });
    return { ok: true };
  }

  @Post('jobs/model/:id/fail')
  @HttpCode(200)
  async failModel(@Param('id') id: string, @Body() body: unknown) {
    const { error } = z.object({ error: z.string().max(2000) }).parse(body);
    await this.prisma.generatedModel.update({
      where: { id },
      data: { status: 'failed', error, finishedAt: new Date() },
    });
    return { ok: true };
  }
}
