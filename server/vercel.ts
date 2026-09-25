import { createApp } from "./app";

// Built once per warm instance and reused across invocations.
const appPromise = createApp().then(({ app }) => app);

export default async function handler(req: any, res: any) {
  const app = await appPromise;
  return app(req, res);
}
