import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

export type JobName = 'document.generate' | 'model.export' | 'asset.optimize';

function redisOptionsFromUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
    maxRetriesPerRequest: null as null,
  };
}

/**
 * Producent zadań BullMQ. Worker (apps/worker) konsumuje kolejkę i komunikuje
 * się z API przez endpointy /internal (token). Gdy Redis jest niedostępny,
 * zadanie kończy się czytelnym błędem - bez cichego udawania.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private queue: Queue | null = null;

  private getQueue(): Queue {
    if (!this.queue) {
      const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
      this.queue = new Queue('door-jobs', { connection: redisOptionsFromUrl(url) });
    }
    return this.queue;
  }

  async enqueue(name: JobName, payload: Record<string, unknown>): Promise<string> {
    const job = await this.getQueue().add(name, payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 500,
      removeOnFail: 500,
    });
    this.logger.log(`Zakolejkowano ${name} (${job.id})`);
    return String(job.id);
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }
}
