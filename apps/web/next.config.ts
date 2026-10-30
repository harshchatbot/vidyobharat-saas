import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep production builds independent from the pre-existing repository-wide
  // lint backlog. Changed stabilization files are gated by lint:stabilization.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
