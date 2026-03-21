/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { hostname: "gateway.pinata.cloud" },
      { hostname: "oaidalleapiprodscus.blob.core.windows.net" },
    ],
  },
  webpack: (config) => {
    config.resolve.alias["@farcaster/mini-app-solana"] = false;
    config.resolve.alias["@react-native-async-storage/async-storage"] = false;
    return config;
  },
};

module.exports = nextConfig;
