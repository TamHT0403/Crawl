/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb"
    }
  },
  allowedDevOrigins: ["chapfallen-gerda-overstrident.ngrok-free.dev"]
};

export default nextConfig;
