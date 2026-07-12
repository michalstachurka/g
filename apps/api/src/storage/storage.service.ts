import { Injectable } from '@nestjs/common';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import type { Readable } from 'node:stream';

/**
 * Adapter storage (ADR-0002). Sterownik `fs` dla dev/demo, interfejs zgodny z S3.
 * Klucze są logiczne (np. "tenants/<id>/assets/<id>/v1.glb") - nigdy nie trafiają
 * do publicznych odpowiedzi API.
 */
export interface StorageDriver {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  stream(key: string): Readable;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

class FsDriver implements StorageDriver {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    const safe = normalize(key).replace(/^([./\\])+/, '');
    if (safe.includes('..')) throw new Error('Nieprawidłowy klucz storage');
    return join(this.root, safe);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.resolve(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  stream(key: string): Readable {
    return createReadStream(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(this.resolve(key));
  }
}

@Injectable()
export class StorageService implements StorageDriver {
  private readonly driver: StorageDriver;

  constructor() {
    const driverName = process.env.STORAGE_DRIVER ?? 'fs';
    if (driverName === 'fs') {
      this.driver = new FsDriver(process.env.STORAGE_FS_ROOT ?? join(process.cwd(), 'var/storage'));
    } else {
      // Sterownik S3 podłączany przez tę samą sygnaturę; konfiguracja w env.
      throw new Error(
        `STORAGE_DRIVER=${driverName} nie jest skonfigurowany w tym środowisku. Użyj "fs" albo dodaj sterownik S3.`,
      );
    }
  }

  put(key: string, data: Buffer) {
    return this.driver.put(key, data);
  }
  get(key: string) {
    return this.driver.get(key);
  }
  stream(key: string) {
    return this.driver.stream(key);
  }
  delete(key: string) {
    return this.driver.delete(key);
  }
  exists(key: string) {
    return this.driver.exists(key);
  }
}
