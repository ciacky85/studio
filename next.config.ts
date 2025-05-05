import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // ignoreBuildErrors: true, // Temporarily remove this to surface build errors
  },
  eslint: {
    // ignoreDuringBuilds: true, // Temporarily remove this to surface build errors
  },
  output: 'standalone', // Explicitly configure standalone output mode
};

export default nextConfig;
