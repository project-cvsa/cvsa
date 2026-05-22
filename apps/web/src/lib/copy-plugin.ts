import type { Plugin, ResolvedConfig } from "vite";
import fs from "fs-extra";
import path from "node:path";

interface PluginOptions {
	src: string;
	dest: string;
}

export default function ssrCopyPlugin(options: PluginOptions): Plugin {
	let config: ResolvedConfig;

	return {
		name: "ssr-copy",
		configResolved(resolvedConfig) {
			config = resolvedConfig;
		},
		async closeBundle() {
			if (!config.build.ssr) return;

			const root = config.root || process.cwd();
			const srcPath = path.resolve(root, options.src);

			const outDir = config.build.outDir || "dist/server";
			const destPath = path.resolve(root, outDir, options.dest);

			try {
				if (await fs.pathExists(srcPath)) {
					await fs.copy(srcPath, destPath, {
						overwrite: true,
						errorOnExist: false,
					});
					console.log(
						`[ssr-copy] Copy ${srcPath} to ${destPath}`
					);
				} else {
					console.warn(`[ssr-copy] Source path not found: ${srcPath}`);
				}
			} catch (err) {
				console.error(`[ssr-copy] Error during copy:`, err);
			}
		},
	};
}
