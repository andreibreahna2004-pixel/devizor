import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer must stay outside the bundler: it loads fonts and
  // native-ish helpers at runtime and breaks when webpack rewrites its imports.
  serverExternalPackages: ["@react-pdf/renderer"],

  /*
    Fonturile de PDF se citesc de pe disc la runtime, cu o cale construita din
    `process.cwd()` (vezi lib/pdf/fonts.ts). Analiza de dependente a Next-ului
    urmareste importurile, nu caile compuse in cod, deci n-are cum sa le vada:
    pe o gazduire serverless ca Vercel, unde in functie ajunge doar ce a fost
    urmarit, `.ttf`-urile lipsesc si ruta de PDF cade cu ENOENT abia la prima
    factura tiparita. Local nu se vede niciodata — acolo exista tot proiectul.

    Fonturile nu sunt un moft: Liberation Sans acopera ș si ț cu virgula
    dedesubt, pe care Helvetica le rateaza. Un PDF fara ele pleaca la beneficiar
    cu patratele in loc de diacritice.
  */
  outputFileTracingIncludes: {
    "/api/devize/*/pdf": ["./assets/fonts/**"],
    "/api/facturi/*/pdf": ["./assets/fonts/**"],
  },
  experimental: {
    // PDF and AI routes stream for a while; keep generous body limits for
    // estimate payloads with many lines.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
