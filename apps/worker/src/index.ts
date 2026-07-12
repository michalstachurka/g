/**
 * Worker zadań asynchronicznych (BullMQ): PDF, wynikowe GLB i USDZ dla AR.
 * Bez dostępu do bazy - pobiera zatwierdzone snapshoty z API (/internal,
 * token) i odsyła wyniki. Izolacja: limity czasu na zadanie, kontrolowane
 * wejście (wyłącznie dane z API).
 */
import { Worker, type Job } from 'bullmq';
import { assetManifestSchema, renderSpecSchema, type PublicMaterialDef } from '@door/contracts';
import { getBinary, getJson, postJson, uploadFile } from './api-client.js';
import { assembleGlb } from './assemble-glb.js';
import { glbToUsdz } from './usdz.js';
import { generatePdf, type DocumentPayload } from './pdf.js';

function redisOptionsFromUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
    maxRetriesPerRequest: null as null,
  };
}

interface ModelJobPayload {
  id: string;
  kind: 'glb' | 'usdz';
  renderSpec: unknown;
  materials: PublicMaterialDef[];
  assets: { publicAssetId: string; manifest: unknown; fileUrl: string }[];
}

async function handleModelExport(modelId: string): Promise<void> {
  const startedAt = Date.now();
  try {
    const payload = await getJson<ModelJobPayload>(`/internal/jobs/model/${modelId}`);
    const renderSpec = renderSpecSchema.parse(payload.renderSpec);
    const manifests: Record<string, ReturnType<typeof assetManifestSchema.parse>> = {};
    const files: Record<string, Uint8Array> = {};
    await Promise.all(
      payload.assets.map(async (asset) => {
        manifests[asset.publicAssetId] = assetManifestSchema.parse(asset.manifest);
        files[asset.publicAssetId] = await getBinary(asset.fileUrl);
      }),
    );

    const glb = await assembleGlb({ renderSpec, manifests, files, materials: payload.materials });
    let output = glb;
    let fileName = `door-${modelId}.glb`;
    if (payload.kind === 'usdz') {
      output = await glbToUsdz(glb);
      fileName = `door-${modelId}.usdz`;
    }
    await uploadFile(`/internal/jobs/model/${modelId}/complete`, output, fileName);
    console.log(`[model] ${payload.kind} ${modelId} gotowy w ${Date.now() - startedAt} ms (${Math.round(output.length / 1024)} kB)`);
  } catch (error) {
    console.error(`[model] ${modelId} błąd:`, error);
    await postJson(`/internal/jobs/model/${modelId}/fail`, {
      error: (error as Error).message.slice(0, 1900),
    }).catch(() => undefined);
    throw error;
  }
}

async function handleDocument(documentId: string): Promise<void> {
  const startedAt = Date.now();
  try {
    const payload = await getJson<DocumentPayload>(`/internal/jobs/document/${documentId}`);
    const { pdf, templateVersion } = await generatePdf(payload);
    await uploadFile(`/internal/jobs/document/${documentId}/complete`, pdf, `${payload.kind}.pdf`, {
      templateVersion: String(templateVersion ?? ''),
    });
    console.log(`[pdf] ${payload.kind} ${documentId} gotowy w ${Date.now() - startedAt} ms`);
  } catch (error) {
    console.error(`[pdf] ${documentId} błąd:`, error);
    await postJson(`/internal/jobs/document/${documentId}/fail`, {
      error: (error as Error).message.slice(0, 1900),
    }).catch(() => undefined);
    throw error;
  }
}

const connection = redisOptionsFromUrl(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');

const worker = new Worker(
  'door-jobs',
  async (job: Job) => {
    switch (job.name) {
      case 'model.export':
        await handleModelExport(String(job.data.modelId));
        break;
      case 'document.generate':
        await handleDocument(String(job.data.documentId));
        break;
      case 'asset.optimize':
        // Kopia publiczna powstaje przy publikacji w API; miejsce na przyszłą
        // optymalizację (prune/dedup/meshopt) bez zmiany kontraktu.
        break;
      default:
        console.warn(`Nieznane zadanie: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 2,
    lockDuration: 120_000,
  },
);

worker.on('ready', () => console.log('Worker gotowy (kolejka door-jobs).'));
worker.on('failed', (job, error) => console.error(`Zadanie ${job?.name} ${job?.id} nieudane: ${error.message}`));

process.on('SIGTERM', async () => {
  await worker.close();
  process.exit(0);
});
