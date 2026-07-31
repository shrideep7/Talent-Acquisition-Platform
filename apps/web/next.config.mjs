/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@mfd/shared'],
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
