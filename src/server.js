import { getConfig } from "./config.js";
import { createApp } from "./http/app.js";

const config = getConfig();
const server = createApp({ publicDir: config.publicDir });

server.listen(config.port, config.host, () => {
  console.log(`Server running at http://${config.host}:${config.port}`);
});

function handleShutdown(signal) {
  console.log(`Received ${signal}, closing server...`);
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));