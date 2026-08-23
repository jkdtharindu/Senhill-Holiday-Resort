import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        // Vercel Blob's public storage. `*` matches one subdomain segment —
        // the store id — so this stays scoped to Blob rather than opening up
        // arbitrary hosts, per the docs' warning about the implied `**`.
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default nextConfig;
