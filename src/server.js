import { getConfig } from "./config.js";
import { createRouter } from "./http/router.js";
import { createApp } from "./http/app.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerApiRoutes } from "./http/routes/apiRoutes.js";
import { createSqliteRepository } from "./repositories/sqlite.js";
import { createMockPaymentGateway } from "./lib/mockPaymentGateway.js";
import { createAuthService } from "./services/authService.js";
import { createEventService } from "./services/eventService.js";
import { createBookingService } from "./services/bookingService.js";

const config = getConfig();
const repository = createSqliteRepository();
const paymentGateway = createMockPaymentGateway();
const authService = createAuthService(repository);
const eventService = createEventService(repository);
const bookingService = createBookingService(repository, paymentGateway);

const router = createRouter();

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return Promise.resolve(req.body);
  }
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("BAD_JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

registerAuthRoutes(router, { authService, repository });
registerApiRoutes(router, {
  eventService,
  bookingService,
  repository,
  readJsonBody,
  sendJson,
});

const server = createApp({
  router,
  publicDir: config.publicDir,
  authService,
  eventService,
  bookingService,
  repository,
});

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