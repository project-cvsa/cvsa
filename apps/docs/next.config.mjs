import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
	serverExternalPackages: ["@takumi-rs/image-response"],
	reactStrictMode: true,
	async rewrites() {
		return [
			{
				source: "/:path*.mdx",
				destination: "/llms.mdx/docs/:path*",
			},
			{
				source: "/:path*.md",
				destination: "/llms.mdx/docs/:path*",
			},
		];
	},
};

export default withMDX(config);
