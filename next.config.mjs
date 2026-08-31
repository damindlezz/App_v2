import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const devHost = process.env.TAURI_DEV_HOST || 'localhost';
const devPort = process.env.TAURI_DEV_PORT || '1420';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {
    root: projectRoot
  },
  // Tauri loads the Next dev server inside a WebView. An explicit dev prefix
  // keeps JS/CSS chunks on that server instead of resolving them against the
  // WebView origin. Production uses Tauri's embedded static export directly.
  assetPrefix: isProduction ? undefined : `http://${devHost}:${devPort}`
};

export default nextConfig;
