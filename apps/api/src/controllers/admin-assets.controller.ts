import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import {
  assetManifestSchema,
  moduleSlotSchema,
  validateManifestForPublish,
} from '@door/contracts';
import { PrismaService } from '../prisma.service';
import {
  AdminAuthGuard,
  CurrentTenant,
  CurrentUser,
  RequireRoles,
  type AuthUser,
  type TenantContext,
} from '../common/auth';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../services/audit.service';
import { inspectGlb } from '../assets/glb-inspector';
import { convertObjToGlb } from '../assets/obj-converter';
import { publicId, sha256Hex } from '../common/utils';

const MAX_GLB_BYTES = 50 * 1024 * 1024;

const uploadMetaSchema = z.object({
  key: z.string().min(1).max(80).regex(/^[a-z0-9_.-]+$/),
  name: z.string().min(1).max(200),
  licenseInfo: z.string().max(4000).optional(),
});

const manifestUpdateSchema = assetManifestSchema
  .omit({ manifestVersion: true, assetKey: true, assetVersion: true, checksum: true, units: true, upAxis: true })
  .partial();

const bundleSchema = z.object({
  key: z.string().min(1).max(80).regex(/^[a-z0-9_.-]+$/),
  name: z.string().min(1).max(200),
  items: z
    .array(
      z.object({
        slot: moduleSlotSchema,
        assetKey: z.string(),
        version: z.number().int().positive().optional(),
        required: z.boolean().default(true),
        order: z.number().int().default(0),
        offsetMm: z.tuple([z.number(), z.number(), z.number()]).optional(),
      }),
    )
    .min(1),
});

@Controller('admin/assets')
@UseGuards(AdminAuthGuard)
@RequireRoles('tenant_admin')
export class AdminAssetsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@CurrentTenant() t: TenantContext) {
    const assets = await this.prisma.asset.findMany({
      where: { tenantId: t.tenantId },
      include: { versions: { orderBy: { version: 'desc' } } },
      orderBy: { key: 'asc' },
    });
    return assets.map((a) => ({
      id: a.id,
      key: a.key,
      name: a.name,
      licenseInfo: a.licenseInfo,
      versions: a.versions.map((v) => ({
        id: v.id,
        version: v.version,
        status: v.status,
        fileName: v.fileName,
        byteSize: v.byteSize,
        checksum: v.checksum,
        publicAssetId: v.publicAssetId,
        hasManifest: Boolean(v.manifest),
        createdAt: v.createdAt,
        publishedAt: v.publishedAt,
      })),
    }));
  }

  /** 1. Upload GLB -> 2. raport techniczny zapisany przy wersji. */
  @Post('upload')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_GLB_BYTES } }))
  async upload(
    @CurrentTenant() t: TenantContext,
    @CurrentUser() u: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: Record<string, string>,
  ) {
    if (!file) throw new BadRequestException('Brak pliku (obsługiwane formaty: GLB, OBJ).');
    const meta = uploadMetaSchema.parse(body);

    // OBJ konwertujemy na brzegu do GLB - reszta pipeline'u (mapowanie ról,
    // viewer, eksporty AR) pracuje wyłącznie na GLB.
    let glbBuffer = file.buffer;
    let objWarnings: string[] = [];
    if (/\.obj$/i.test(file.originalname)) {
      try {
        const converted = await convertObjToGlb(file.buffer.toString('utf8'));
        glbBuffer = converted.glb;
        objWarnings = [
          `Skonwertowano z OBJ (${converted.info.nodeCount} części, ${converted.info.triangleCount} trójkątów).`,
          ...converted.info.warnings,
        ];
      } catch (error) {
        throw new BadRequestException(`Konwersja OBJ nie powiodła się: ${(error as Error).message}`);
      }
    }

    const report = inspectGlb(glbBuffer);
    report.warnings.push(...objWarnings);
    if (!report.valid) {
      throw new BadRequestException(`Plik odrzucony: ${report.problems.join(' ')}`);
    }
    const checksum = sha256Hex(glbBuffer);

    let asset = await this.prisma.asset.findUnique({
      where: { tenantId_key: { tenantId: t.tenantId, key: meta.key } },
    });
    if (!asset) {
      asset = await this.prisma.asset.create({
        data: {
          tenantId: t.tenantId,
          key: meta.key,
          name: meta.name,
          licenseInfo: meta.licenseInfo ? { note: meta.licenseInfo } : undefined,
        },
      });
    }
    const lastVersion = await this.prisma.assetVersion.findFirst({
      where: { assetId: asset.id },
      orderBy: { version: 'desc' },
    });
    const version = (lastVersion?.version ?? 0) + 1;
    const storagePath = `private/assets/${t.tenantId}/${asset.id}/v${version}.glb`;
    await this.storage.put(storagePath, glbBuffer);

    const created = await this.prisma.assetVersion.create({
      data: {
        assetId: asset.id,
        version,
        status: 'draft',
        fileName: file.originalname,
        byteSize: glbBuffer.length,
        checksum,
        storagePath,
        report: report as unknown as object,
      },
    });
    await this.audit.log({
      tenantId: t.tenantId,
      userId: u.id,
      userEmail: u.email,
      action: 'upload',
      entity: 'AssetVersion',
      entityId: created.id,
      after: { key: meta.key, version, checksum },
    });
    return { assetId: asset.id, assetKey: asset.key, versionId: created.id, version, report };
  }

  @Get(':assetKey/versions/:version')
  async getVersion(
    @CurrentTenant() t: TenantContext,
    @Param('assetKey') assetKey: string,
    @Param('version') versionStr: string,
  ) {
    const version = await this.findVersion(t.tenantId, assetKey, Number(versionStr));
    return {
      id: version.id,
      assetKey,
      version: version.version,
      status: version.status,
      fileName: version.fileName,
      byteSize: version.byteSize,
      checksum: version.checksum,
      report: version.report,
      manifest: version.manifest,
      validationErrors: version.validationErrors,
      publicAssetId: version.publicAssetId,
    };
  }

  /** Podgląd surowego pliku w panelu (przed publikacją). */
  @Get(':assetKey/versions/:version/file')
  async versionFile(
    @CurrentTenant() t: TenantContext,
    @Param('assetKey') assetKey: string,
    @Param('version') versionStr: string,
    @Res() res: Response,
  ) {
    const version = await this.findVersion(t.tenantId, assetKey, Number(versionStr));
    res.setHeader('Content-Type', 'model/gltf-binary');
    res.setHeader('Cache-Control', 'private, max-age=60');
    this.storage.stream(version.storagePath).pipe(res);
  }

  private async findVersion(tenantId: string, assetKey: string, versionNo: number) {
    const asset = await this.prisma.asset.findUnique({
      where: { tenantId_key: { tenantId, key: assetKey } },
    });
    if (!asset) throw new NotFoundException('Asset nie istnieje.');
    const version = await this.prisma.assetVersion.findUnique({
      where: { assetId_version: { assetId: asset.id, version: versionNo } },
    });
    if (!version) throw new NotFoundException('Wersja nie istnieje.');
    return version;
  }

  /** 3-8. Zapis manifestu: role, wymiary, pivot, skala, mapowania, anchory. */
  @Put(':assetKey/versions/:version/manifest')
  async updateManifest(
    @CurrentTenant() t: TenantContext,
    @CurrentUser() u: AuthUser,
    @Param('assetKey') assetKey: string,
    @Param('version') versionStr: string,
    @Body() body: unknown,
  ) {
    const version = await this.findVersion(t.tenantId, assetKey, Number(versionStr));
    if (version.status === 'published') {
      throw new BadRequestException('Opublikowana wersja jest niezmienna. Wgraj nową wersję.');
    }
    const patch = manifestUpdateSchema.parse(body);
    const current = (version.manifest as Record<string, unknown> | null) ?? {};
    const report = version.report as { suggestedBaseWidthMm?: number; suggestedBaseHeightMm?: number; suggestedBaseDepthMm?: number } | null;
    const merged = {
      manifestVersion: '1',
      assetKey,
      assetVersion: version.version,
      units: 'meters',
      upAxis: 'y',
      forwardAxis: '-z',
      mountingPlane: 'wall',
      pivotPolicy: 'origin_as_authored',
      scalePolicy: 'width_height',
      mirrorPolicy: 'allow',
      semanticRole: 'door_leaf',
      baseWidthMm: report?.suggestedBaseWidthMm ?? 900,
      baseHeightMm: report?.suggestedBaseHeightMm ?? 2100,
      baseDepthMm: report?.suggestedBaseDepthMm ?? 50,
      allowedDimensionRange: { minWidthMm: 600, maxWidthMm: 1200, minHeightMm: 1900, maxHeightMm: 2400 },
      nodeBindings: [],
      materialBindings: [],
      anchorBindings: [],
      animationBindings: [],
      compression: 'none',
      checksum: version.checksum,
      ...current,
      ...patch,
    };
    const manifest = assetManifestSchema.parse(merged);
    const problems = validateManifestForPublish(manifest);
    const updated = await this.prisma.assetVersion.update({
      where: { id: version.id },
      data: {
        manifest: manifest as unknown as object,
        validationErrors: problems.length ? problems : undefined,
        status: problems.length ? 'invalid' : 'valid',
      },
    });
    await this.audit.log({
      tenantId: t.tenantId,
      userId: u.id,
      userEmail: u.email,
      action: 'update_manifest',
      entity: 'AssetVersion',
      entityId: version.id,
    });
    return { manifest: updated.manifest, validationErrors: problems, status: updated.status };
  }

  /** 13. Publikacja wersji: kopia publiczna + nieprzewidywalny identyfikator. */
  @Post(':assetKey/versions/:version/publish')
  @HttpCode(200)
  async publish(
    @CurrentTenant() t: TenantContext,
    @CurrentUser() u: AuthUser,
    @Param('assetKey') assetKey: string,
    @Param('version') versionStr: string,
  ) {
    const version = await this.findVersion(t.tenantId, assetKey, Number(versionStr));
    if (!version.manifest) {
      throw new BadRequestException('Publikacja zablokowana: brak manifestu (mapowanie, wymiary, pivot, skala).');
    }
    const manifest = assetManifestSchema.parse(version.manifest);
    const problems = validateManifestForPublish(manifest);
    if (problems.length > 0) {
      throw new BadRequestException(`Publikacja zablokowana: ${problems.join(' ')}`);
    }
    const licenseInfo = (await this.prisma.asset.findUnique({ where: { id: version.assetId } }))?.licenseInfo as
      | { status?: string }
      | null;
    if (licenseInfo?.status === 'license_unconfirmed') {
      throw new BadRequestException(
        'Publikacja zablokowana: licencja assetu jest niepotwierdzona (patrz docs/LICENSE_AUDIT.md).',
      );
    }

    // Kopia publiczna 1:1 pliku źródłowego (uproszczone assety wchodzą uproszczone).
    const buffer = await this.storage.get(version.storagePath);
    const token = version.publicAssetId ?? publicId('pub');
    const publicStoragePath = `public/assets/${t.tenantId}/${token}.glb`;
    await this.storage.put(publicStoragePath, buffer);

    const updated = await this.prisma.assetVersion.update({
      where: { id: version.id },
      data: {
        status: 'published',
        publicAssetId: token,
        publicStoragePath,
        publishedAt: new Date(),
        publishedById: u.id,
      },
    });
    await this.audit.log({
      tenantId: t.tenantId,
      userId: u.id,
      userEmail: u.email,
      action: 'publish',
      entity: 'AssetVersion',
      entityId: version.id,
      after: { publicAssetId: token, version: version.version },
    });
    return { ok: true, publicAssetId: updated.publicAssetId };
  }

  @Post(':assetKey/versions/:version/archive')
  @HttpCode(200)
  async archive(
    @CurrentTenant() t: TenantContext,
    @CurrentUser() u: AuthUser,
    @Param('assetKey') assetKey: string,
    @Param('version') versionStr: string,
  ) {
    const version = await this.findVersion(t.tenantId, assetKey, Number(versionStr));
    await this.prisma.assetVersion.update({ where: { id: version.id }, data: { status: 'archived' } });
    await this.audit.log({
      tenantId: t.tenantId,
      userId: u.id,
      userEmail: u.email,
      action: 'archive',
      entity: 'AssetVersion',
      entityId: version.id,
    });
    return { ok: true };
  }

  // ── AssetBundle ──────────────────────────────────────────────────────────

  @Get('bundles')
  async bundles(@CurrentTenant() t: TenantContext) {
    return this.prisma.assetBundle.findMany({
      where: { tenantId: t.tenantId },
      include: { items: { include: { assetVersion: { include: { asset: true } } }, orderBy: { order: 'asc' } } },
      orderBy: { key: 'asc' },
    });
  }

  @Post('bundles')
  async createBundle(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Body() body: unknown) {
    const input = bundleSchema.parse(body);
    const itemsData = await this.resolveBundleItems(t.tenantId, input.items);
    const bundle = await this.prisma.assetBundle.create({
      data: {
        tenantId: t.tenantId,
        key: input.key,
        name: input.name,
        items: { create: itemsData },
      },
      include: { items: true },
    });
    await this.audit.log({
      tenantId: t.tenantId, userId: u.id, userEmail: u.email,
      action: 'create', entity: 'AssetBundle', entityId: bundle.id, after: input,
    });
    return bundle;
  }

  @Put('bundles/:key')
  async updateBundle(
    @CurrentTenant() t: TenantContext,
    @CurrentUser() u: AuthUser,
    @Param('key') key: string,
    @Body() body: unknown,
  ) {
    const input = bundleSchema.partial({ key: true }).parse(body);
    const bundle = await this.prisma.assetBundle.findUnique({
      where: { tenantId_key: { tenantId: t.tenantId, key } },
    });
    if (!bundle) throw new NotFoundException();
    if (input.items) {
      const itemsData = await this.resolveBundleItems(t.tenantId, input.items);
      await this.prisma.assetBundleItem.deleteMany({ where: { bundleId: bundle.id } });
      await this.prisma.assetBundle.update({
        where: { id: bundle.id },
        data: {
          name: input.name,
          status: 'draft',
          version: bundle.version + 1,
          items: { create: itemsData },
        },
      });
    } else if (input.name) {
      await this.prisma.assetBundle.update({ where: { id: bundle.id }, data: { name: input.name } });
    }
    await this.audit.log({
      tenantId: t.tenantId, userId: u.id, userEmail: u.email,
      action: 'update', entity: 'AssetBundle', entityId: bundle.id, after: input,
    });
    return this.prisma.assetBundle.findUnique({ where: { id: bundle.id }, include: { items: true } });
  }

  private async resolveBundleItems(
    tenantId: string,
    items: z.infer<typeof bundleSchema>['items'],
  ) {
    const result = [];
    for (const item of items) {
      const asset = await this.prisma.asset.findUnique({
        where: { tenantId_key: { tenantId, key: item.assetKey } },
        include: { versions: { orderBy: { version: 'desc' } } },
      });
      if (!asset) throw new BadRequestException(`Nieznany asset: ${item.assetKey}`);
      const version = item.version
        ? asset.versions.find((v) => v.version === item.version)
        : asset.versions.find((v) => v.status === 'published') ?? asset.versions[0];
      if (!version) throw new BadRequestException(`Asset ${item.assetKey} nie ma żadnej wersji.`);
      result.push({
        slot: item.slot,
        assetVersionId: version.id,
        required: item.required,
        order: item.order,
        offsetMm: item.offsetMm ?? [0, 0, 0],
      });
    }
    return result;
  }

  /** Publikacja bundla: wszystkie wymagane moduły muszą być opublikowane. */
  @Post('bundles/:key/publish')
  @HttpCode(200)
  async publishBundle(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('key') key: string) {
    const bundle = await this.prisma.assetBundle.findUnique({
      where: { tenantId_key: { tenantId: t.tenantId, key } },
      include: { items: { include: { assetVersion: { include: { asset: true } } } } },
    });
    if (!bundle) throw new NotFoundException();
    const notPublished = bundle.items.filter(
      (i) => i.required && i.assetVersion.status !== 'published',
    );
    if (notPublished.length > 0) {
      throw new BadRequestException(
        `Publikacja zablokowana - moduły bez publikacji: ${notPublished
          .map((i) => `${i.slot} (${i.assetVersion.asset.key} v${i.assetVersion.version})`)
          .join(', ')}`,
      );
    }
    await this.prisma.assetBundle.update({
      where: { id: bundle.id },
      data: { status: 'published', publishedAt: new Date() },
    });
    await this.audit.log({
      tenantId: t.tenantId, userId: u.id, userEmail: u.email,
      action: 'publish', entity: 'AssetBundle', entityId: bundle.id,
    });
    return { ok: true };
  }

  @Delete('bundles/:key')
  async deleteBundle(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('key') key: string) {
    const bundle = await this.prisma.assetBundle.findUnique({
      where: { tenantId_key: { tenantId: t.tenantId, key } },
    });
    if (!bundle) throw new NotFoundException();
    await this.prisma.assetBundle.delete({ where: { id: bundle.id } });
    await this.audit.log({
      tenantId: t.tenantId, userId: u.id, userEmail: u.email,
      action: 'delete', entity: 'AssetBundle', entityId: bundle.id,
    });
    return { ok: true };
  }

  /** Raport brakujących assetów (MISSING_ASSET) dla panelu. */
  @Get('missing-report')
  async missingReport(@CurrentTenant() t: TenantContext) {
    const categories = await this.prisma.productCategory.findMany({
      where: { tenantId: t.tenantId },
      include: {
        families: {
          include: { models: { include: { bundle: { include: { items: { include: { assetVersion: true } } } } } } },
        },
      },
      orderBy: { order: 'asc' },
    });
    return categories.map((c) => {
      const models = c.families.flatMap((f) => f.models);
      const problems: { modelKey: string; status: string; detail: string }[] = [];
      for (const m of models) {
        if (!m.bundle) {
          problems.push({ modelKey: m.key, status: 'MISSING_ASSET', detail: 'Model nie ma przypisanego AssetBundle.' });
          continue;
        }
        const missing = m.bundle.items.filter((i) => i.required && i.assetVersion.status !== 'published');
        if (m.bundle.status !== 'published' || missing.length > 0) {
          problems.push({
            modelKey: m.key,
            status: 'MISSING_ASSET',
            detail:
              m.bundle.status !== 'published'
                ? 'AssetBundle nie jest opublikowany.'
                : `Nieopublikowane moduły: ${missing.map((i) => i.slot).join(', ')}`,
          });
        }
      }
      return {
        categoryKey: c.key,
        categoryName: c.name,
        ready: models.length > 0 && problems.length === 0,
        problems,
        modelsCount: models.length,
      };
    });
  }
}
