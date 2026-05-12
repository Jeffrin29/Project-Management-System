import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["98.70.44.251", "98.70.44.251:4000"],

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
        ignored: /node_modules/,
      };
    }
    return config;
  },
};

export default nextConfig;