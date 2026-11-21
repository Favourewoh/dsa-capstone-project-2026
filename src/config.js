import path from "node:path";

export function getConfig(env = process.env) {
  const rawPort = env.PORT;
  let port = 3000;

  if (rawPort !== undefined && String(rawPort).trim() !== "") {
    const parsed = Number(rawPort);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new Error(`Invalid PORT "${rawPort}". Must be an integer between 1 and 65535.`);
    }
    port = parsed;
  }

  return {
    port,
    host: env.HOST || "0.0.0.0",
    publicDir: path.resolve(process.cwd(), env.PUBLIC_DIR || "public"),
  };
}