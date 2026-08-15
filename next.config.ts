import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer must stay outside the bundler: it loads fonts and
  // native-ish helpers at runtime and breaks when webpack rewrites its imports.
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    // PDF and AI routes stream for a while; keep generous body limits for
    // estimate payloads with many lines.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
