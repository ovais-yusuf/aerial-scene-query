/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    outputFileTracingIncludes: {
      "/": [
        "./data/**/*",
        "./Metric_Graph_Research_Data/data/manifest.json",
        "./Metric_Graph_Research_Data/data/validation_report.json",
        "./Metric_Graph_Research_Data/data/frame_index.json",
      ],
      "/api/ask": [
        "./data/**/*",
        "./Metric_Graph_Research_Data/data/manifest.json",
        "./Metric_Graph_Research_Data/data/validation_report.json",
        "./Metric_Graph_Research_Data/data/frame_index.json",
      ],
      "/api/cell-matrices": [
        "./data/**/*",
        "./Metric_Graph_Research_Data/data/**/*",
      ],
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
