import { getConfig } from "./config.js";
import { createApp } from "./http/app.js";
import { createSqliteRepository } from "./repositories/sqlite.js";
import { createMockPaymentGateway } from "./lib/mockPaymentGateway.js";
import { createEventService } from "./services/eventService.js";
import { createBookingService } from "./services/bookingService.js";

const config = getConfig();
const repository = createSqliteRepository();
const paymentGateway = createMockPaymentGateway();
const eventService = createEventService(repository);
const bookingService = createBookingService(repository, paymentGateway);

const server = createApp({
  publicDir: config.publicDir,
  eventService,
  bookingService,
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