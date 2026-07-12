import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { layoutSettingsSchema, themeTokensSchema } from '@door/contracts';
import { PrismaService } from '../prisma.service';
import { AdminAuthGuard, CurrentTenant, CurrentUser, RequireRoles, type AuthUser, type TenantContext } from '../common/auth';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../services/audit.service';
import { randomToken } from '../common/utils';

const themeUpdateSchema = z.object({
  themeTokens: themeTokensSchema.partial().optional(),
  layout: layoutSettingsSchema.partial().optional(),
  texts: z.record(z.string(), z.string()).optional(),
  footerText: z.string().max(2000).nullable().optional(),
  contact: z
    .object({ phone: z.string().nullable(), email: z.string().nullable(), address: z.string().nullable() })
    .nullable()
    .optional(),
  legalLinks: z.array(z.object({ label: z.string(), url: z.string() })).optional(),
  languages: z.array(z.string().min(2).max(5)).optional(),
  logoUrl: z.string().nullable().optional(),
  logoDarkUrl: z.string().nullable().optional(),
  faviconUrl: z.string().nullable().optional(),
});

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'image/x-icon']);

@Controller('admin/branding')
@UseGuards(AdminAuthGuard)
@RequireRoles('tenant_admin')
export class AdminBrandingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  private async draftTheme(tenantId: string) {
    let draft = await this.prisma.tenantTheme.findFirst({
      where: { tenantId, status: 'draft' },
      orderBy: { version: 'desc' },
    });
    if (!draft) {
      const latest = await this.prisma.tenantTheme.findFirst({
        where: { tenantId },
        orderBy: { version: 'desc' },
      });
      draft = await this.prisma.tenantTheme.create({
        data: {
          tenantId,
          status: 'draft',
          version: (latest?.version ?? 0) + 1,
          themeTokens: latest?.themeTokens ?? themeTokensSchema.parse({}),
          layout: latest?.layout ?? layoutSettingsSchema.parse({}),
          texts: latest?.texts ?? {},
          logoUrl: latest?.logoUrl,
          logoDarkUrl: latest?.logoDarkUrl,
          faviconUrl: latest?.faviconUrl,
          footerText: latest?.footerText,
          contact: latest?.contact ?? undefined,
          legalLinks: latest?.legalLinks ?? [],
          languages: latest?.languages ?? ['pl'],
        },
      });
    }
    return draft;
  }

  @Get()
  async get(@CurrentTenant() tenant: TenantContext) {
    const draft = await this.draftTheme(tenant.tenantId);
    const published = await this.prisma.tenantTheme.findFirst({
      where: { tenantId: tenant.tenantId, status: 'published' },
      orderBy: { version: 'desc' },
    });
    return { draft, publishedVersion: published?.version ?? null };
  }

  @Put()
  async update(@CurrentTenant() tenant: TenantContext, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    const input = themeUpdateSchema.parse(body);
    const draft = await this.draftTheme(tenant.tenantId);
    const updated = await this.prisma.tenantTheme.update({
      where: { id: draft.id },
      data: {
        themeTokens: input.themeTokens
          ? { ...(draft.themeTokens as object), ...input.themeTokens }
          : undefined,
        layout: input.layout ? { ...(draft.layout as object), ...input.layout } : undefined,
        texts: input.texts ? { ...(draft.texts as object), ...input.texts } : undefined,
        footerText: input.footerText === undefined ? undefined : input.footerText,
        contact: input.contact === undefined ? undefined : (input.contact as object),
        legalLinks: input.legalLinks === undefined ? undefined : input.legalLinks,
        languages: input.languages === undefined ? undefined : input.languages,
        logoUrl: input.logoUrl === undefined ? undefined : input.logoUrl,
        logoDarkUrl: input.logoDarkUrl === undefined ? undefined : input.logoDarkUrl,
        faviconUrl: input.faviconUrl === undefined ? undefined : input.faviconUrl,
      },
    });
    await this.audit.log({
      tenantId: tenant.tenantId,
      userId: user.id,
      userEmail: user.email,
      action: 'update',
      entity: 'TenantTheme',
      entityId: updated.id,
    });
    return updated;
  }

  @Post('publish')
  @HttpCode(200)
  async publish(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: AuthUser) {
    const draft = await this.draftTheme(tenant.tenantId);
    await this.prisma.tenantTheme.updateMany({
      where: { tenantId: tenant.tenantId, status: 'published' },
      data: { status: 'archived' },
    });
    const published = await this.prisma.tenantTheme.update({
      where: { id: draft.id },
      data: { status: 'published', publishedAt: new Date(), publishedById: user.id },
    });
    await this.audit.log({
      tenantId: tenant.tenantId,
      userId: user.id,
      userEmail: user.email,
      action: 'publish',
      entity: 'TenantTheme',
      entityId: published.id,
      after: { version: published.version },
    });
    return { ok: true, version: published.version };
  }

  @Post('upload')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  async upload(@CurrentTenant() tenant: TenantContext, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Brak pliku.');
    if (!IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Dozwolone formaty: PNG, JPG, SVG, WEBP, ICO.');
    }
    const ext = file.originalname.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const name = `${randomToken(10)}.${ext}`;
    await this.storage.put(`public/branding/${tenant.tenantId}/${name}`, file.buffer);
    return { url: `/files/branding/${tenant.tenantId}/${name}` };
  }
}
