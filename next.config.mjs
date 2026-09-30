/** @type {import('next').NextConfig} */
const nextConfig = {
  // @react-pdf/renderer pulls in pdfkit, which requires its standard-font
  // data files (font metrics + .cjs modules) at runtime via dynamic
  // require() calls that Next.js's build-time file tracing can't detect.
  // Without this, Vercel's serverless bundle silently prunes those files —
  // export works locally (full node_modules present) but 500s in
  // production with "Cannot find module '.../pdfkit/js/standard-fonts/...'".
  experimental: {
    outputFileTracingIncludes: {
      "/api/export/document": [
        "./node_modules/pdfkit/js/data/**/*",
        "./node_modules/pdfkit/js/standard-fonts/**/*",
      ],
    },
  },
};

export default nextConfig;
