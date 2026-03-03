import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

async function buildForVercel() {
  await rm("dist", { recursive: true, force: true });

  // 1. Build client with Vite → dist/public/
  console.log("Building client...");
  await viteBuild();

  // 2. Bundle API serverless function with esbuild → api/index.js
  console.log("Building API serverless function...");

  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];

  // Bundle local code (resolving path aliases), keep npm packages external
  await esbuild({
    entryPoints: ["server/vercel.ts"],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: "api/index.js",
    target: "node18",
    alias: {
      "@shared": "./shared",
      "@": "./client/src",
    },
    // Keep npm packages external - Vercel has node_modules available
    external: allDeps,
    banner: {
      js: "// Auto-generated Vercel serverless function\n",
    },
    logLevel: "info",
  });

  console.log("Vercel build complete!");
}

buildForVercel().catch((err) => {
  console.error(err);
  process.exit(1);
});
