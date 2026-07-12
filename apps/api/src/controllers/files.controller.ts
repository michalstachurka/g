import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma.service';
import { StorageService } from '../storage/storage.service';
import { verifyPayload } from '../common/utils';

const MODEL_CONTENT_TYPES: Record<string, string> = {
  glb: 'model/gltf-binary',
  usdz: 'model/vnd.usdz+zip',
};

@Controller('files')
export class FilesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Publiczne wynikowe modele AR - identyfikator nieprzewidywalny. */
  @Get('models/:token')
  async model(@Param('token') token: string, @Res() res: Response) {
    const record = await this.prisma.generatedModel.findUnique({ where: { publicToken: token } });
    if (!record || record.status !== 'done' || !record.storagePath) {
      throw new NotFoundException('Model nie istnieje.');
    }
    res.setHeader('Content-Type', MODEL_CONTENT_TYPES[record.kind] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (record.checksum) res.setHeader('ETag', `"${record.checksum}"`);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="drzwi-${record.snapshotId.slice(-6)}.${record.kind}"`,
    );
    this.storage.stream(record.storagePath).pipe(res);
  }

  /** Dokumenty prywatne - wyłącznie przez krótkotrwały podpisany token. */
  @Get('documents/:token')
  async document(@Param('token') token: string, @Res() res: Response) {
    const payload = verifyPayload(token);
    const id = typeof payload?.d === 'string' ? payload.d : null;
    if (!id) throw new NotFoundException('Link wygasł.');
    const record = await this.prisma.generatedDocument.findUnique({ where: { id } });
    if (!record || record.status !== 'done' || !record.storagePath) {
      throw new NotFoundException('Dokument nie istnieje.');
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${record.kind}-${record.id.slice(-6)}.pdf"`);
    this.storage.stream(record.storagePath).pipe(res);
  }

  /** Publiczne pliki brandingowe (logo, favicon) i miniatury. */
  @Get('branding/:tenantId/:name')
  async branding(
    @Param('tenantId') tenantId: string,
    @Param('name') name: string,
    @Res() res: Response,
  ) {
    if (!/^[a-zA-Z0-9._-]+$/.test(name) || !/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
      throw new NotFoundException();
    }
    const key = `public/branding/${tenantId}/${name}`;
    if (!(await this.storage.exists(key))) throw new NotFoundException();
    const ext = name.split('.').pop()?.toLowerCase();
    const types: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      svg: 'image/svg+xml',
      webp: 'image/webp',
      ico: 'image/x-icon',
    };
    res.setHeader('Content-Type', types[ext ?? ''] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    this.storage.stream(key).pipe(res);
  }
}
