import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.public.blob.vercel-storage.com' },
      { protocol: 'https', hostname: 'replicate.delivery' },
      { protocol: 'https', hostname: 'oaidalleapiprodscus.blob.core.windows.net' },
      { protocol: 'https', hostname: 'fly-froth.com' },
    ],
  },
  // Native bindings + heavy server-only deps Turbopack can't bundle into ESM.
  // Loaded via Node's require at runtime instead.
  //   @napi-rs/canvas → native .node binary for Cairo/Skia
  //   pdfjs-dist     → ships its own worker + uses Node-only crypto/streams
  //   sharp          → libvips native binding (already worked but be explicit)
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist', 'sharp'],
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
  },
};

export default nextConfig;
