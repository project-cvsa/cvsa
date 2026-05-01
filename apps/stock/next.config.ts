import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	/* config options here */
	reactCompiler: true,
	reactStrictMode: false,
	allowedDevOrigins: ["192.168.31.199"],
};

export default nextConfig;
