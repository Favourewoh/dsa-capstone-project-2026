import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSqliteRepository } from "../src/repositories/sqlite.js";
import { createEventService } from "../src/services/eventService.js";
import { createBookingService } from "../src/services/bookingService.js";
import { createMockPaymentGateway } from "../src/lib/mockPaymentGateway.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaSql = fs.readFileSync(path.resolve(__dirname, "../src/db/schema.sql"), "utf8");

function setupTestDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(schemaSql);
  const repository = createSqliteRepository(db);
  const eventService = createEventService(repository);
  const bookingService = createBookingService(repository, createMockPaymentGateway());
  return { repository, eventService, bookingService };
}

describe("Build 5 overselling prevention (S08)", () => {
  it("allows exactly 1 booking and rejects 49 with SOLD_OUT when 50 compete for the last seat", async () => {
    const { repository, eventService, bookingService } = setupTestDb();

    const event = await eventService.createEvent({
      title: "Last Seat Test Event",
      city: "Lagos",
      venue: "Main Arena",
      startsAt: "2026-12-30T18:00:00.000Z",
      organizerId: "org-test",
    });

    const tier = await eventService.addTier(event.id, {
      name: "Final Ticket",
      priceCents: 3000,
      capacity: 1,
    });

    await eventService.publishEvent(event.id);

    const results = await Promise.allSettled(
      Array.from({ length: 50 }, (_, i) =>
        bookingService.createBooking({
          tierId: tier.id,
          attendeeName: `Buyer ${i + 1}`,
          quantity: 1,
          userId: `buyer-${i + 1}`,
        })
      )
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 49);

    for (const item of rejected) {
      assert.equal(item.reason?.code, "SOLD_OUT");
    }

    const persistedTier = await repository.getTierById(tier.id);
    assert.equal(persistedTier.sold, 1);
    assert.equal(persistedTier.seatsLeft, 0);
  });
});