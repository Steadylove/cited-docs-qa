import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist ships a Node build that webpack should not try to bundle.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
