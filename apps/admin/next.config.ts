import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@door/contracts', '@door/three-viewer', '@door/config-engine', '@door/ui'],
  eslint: { ignoreDuringBuilds: true },
};

export default config;
