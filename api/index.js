// Vercel serverless entrypoint. This file must exist in the repo because
// vercel.json's `functions` pattern is validated before the build command
// runs. The real handler is bundled to dist/server/index.js by
// `npm run build:vercel` (script/build-vercel.ts).
export { default } from "../dist/server/index.js";
