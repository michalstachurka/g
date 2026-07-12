import type { NextConfig } from 'next';

// Panel serwowany pod /panel (jeden wspólny adres z konfiguratorem za proxy).
// basePath można wyłączyć dla samodzielnego hostingu przez ADMIN_BASE_PATH="".
const basePath = process.env.ADMIN_BASE_PATH ?? '/panel';

const config: NextConfig = {
  basePath: basePath || undefined,
  transpilePackages: ['@door/contracts', '@door/three-viewer', '@door/config-engine', '@door/ui'],
  eslint: { ignoreDuringBuilds: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default config;
