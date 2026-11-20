import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createStore, publishEvent, unpublishEvent, listEventSummaries } from "../src/domain/inventory.js";
import { filterEvents, sortEvents, searchEvents } from "../src/domain/eventSearch.js";
import { mergeSort } from "../src/domain/sorting.js";
import { DomainError, ErrorCodes } from "../src/domain/errors.js";

function assertDomainError(fn, expectedCode) {
  assert.throws(
    fn,
    (err) => {
      assert.ok(err instanceof DomainError, `Expected DomainError, got ${err?.name}`);
      assert.equal(err.code, expectedCode);
      return true;
    }
  );
}

describe("Build 2 Domain & Search", () => {
  it("S02: creates a draft event hidden from public list and rejects invalid input with VALIDATION", () => {
    const store = createStore();
    const created = store.createEvent({
      title: "Lagos Systems Meetup",
      city: "Lagos",
      venue: "Victoria Island Hub",
      startsAt: "2026-12-10T17:00:00.000Z",
    });

    assert.ok(created.id);
    assert.equal(created.published, false);
    assert.equal(listEventSummaries(store, { publishedOnly: true }).length, 0);
    assert.equal(listEventSummaries(store, { publishedOnly: false }).length, 1);

    assertDomainError(
      () =>
        store.createEvent({
          title: "",
          city: "Lagos",
          venue: "Hall",
          startsAt: "2026-12-10T17:00:00.000Z",
        }),
      ErrorCodes.VALIDATION
    );
    assertDomainError(
      () =>
        store.createEvent({
          title: "Valid Title",
          city: "",
          venue: "Hall",
          startsAt: "2026-12-10T17:00:00.000Z",
        }),
      ErrorCodes.VALIDATION
    );
    assertDomainError(
      () =>
        store.createEvent({
          title: "Valid Title",
          city: "Lagos",
          venue: "Hall",
          startsAt: "not-a-real-date",
        }),
      ErrorCodes.VALIDATION
    );
  });

  it("S03: adds tier with seatsLeft equal to capacity, validates price/capacity, and handles missing event", () => {
    const store = createStore();
    const draft = store.createEvent({
      title: "Draft Conference",
      city: "Abuja",
      venue: "Congress Centre",
      startsAt: "2026-12-15T09:00:00.000Z",
    });

    const tier = store.addTier(draft.id, {
      name: "General",
      priceCents: 500000,
      capacity: 100,
    });
    assert.equal(tier.priceCents, 500000);
    assert.equal(tier.capacity, 100);
    assert.equal(tier.seatsLeft, 100);

    assertDomainError(
      () => store.addTier(draft.id, { name: "VIP", priceCents: 12.5, capacity: 10 }),
      ErrorCodes.VALIDATION
    );
    assertDomainError(
      () => store.addTier(draft.id, { name: "VIP", priceCents: 1000, capacity: 0 }),
      ErrorCodes.VALIDATION
    );
    assertDomainError(
      () => store.addTier("non-existent-id", { name: "VIP", priceCents: 1000, capacity: 10 }),
      ErrorCodes.NOT_FOUND
    );
  });

  it("S04: publishes event with tiers, blocks publishing without tiers with INVALID_STATE, and unpublishes", () => {
    const store = createStore();
    const noTierEvent = store.createEvent({
      title: "Empty Tier Event",
      city: "Lagos",
      venue: "Civic Hall",
      startsAt: "2026-12-20T18:00:00.000Z",
    });

    assertDomainError(() => publishEvent(store, noTierEvent.id), ErrorCodes.INVALID_STATE);

    const readyEvent = store.createEvent({
      title: "Ready Event",
      city: "Lagos",
      venue: "Civic Hall",
      startsAt: "2026-12-21T18:00:00.000Z",
    });
    store.addTier(readyEvent.id, { name: "Standard", priceCents: 250000, capacity: 50 });

    const published = publishEvent(store, readyEvent.id);
    assert.equal(published.published, true);
    assert.equal(listEventSummaries(store, { publishedOnly: true }).length, 1);

    const unpublished = unpublishEvent(store, readyEvent.id);
    assert.equal(unpublished.published, false);
    assert.equal(listEventSummaries(store, { publishedOnly: true }).length, 0);
  });

  it("S05: searches, filters, and sorts without mutating inputs, preserving stability and ties", () => {
    const e1 = {
      id: "id-b",
      title: "Lagos Tech Meetup",
      city: "Lagos",
      venue: "Yaba Hub",
      startsAt: "2026-12-05T10:00:00.000Z",
      cheapestPriceCents: 10000,
      seatsLeft: 20,
    };
    const e2 = {
      id: "id-a",
      title: "Abuja Jazz Night",
      city: "Abuja",
      venue: "Jazz Lounge",
      startsAt: "2026-12-05T17:00:00.000Z",
      cheapestPriceCents: 5000,
      seatsLeft: 5,
    };
    const e3 = {
      id: "id-c",
      title: "Same Day Afternoon Talk",
      city: "Lagos",
      venue: "Lagos Island",
      startsAt: "2026-12-05T17:00:00.000Z",
      cheapestPriceCents: 5000,
      seatsLeft: 50,
    };
    const eNoTier = {
      id: "id-d",
      title: "Tierless Preview",
      city: "Lagos",
      venue: "Main Stage",
      startsAt: "2026-12-06T12:00:00.000Z",
      cheapestPriceCents: null,
      seatsLeft: 0,
    };

    const original = [e1, e2, e3, eNoTier];
    const snapshot = JSON.stringify(original);

    // Search text case-insensitively
    const jazzOnly = filterEvents(original, { q: "JAZZ" });
    assert.equal(jazzOnly.length, 1);
    assert.equal(jazzOnly[0].title, "Abuja Jazz Night");

    // Filter city case-insensitively
    const lagosOnly = filterEvents(original, { city: "lagos" });
    assert.deepEqual(
      lagosOnly.map((e) => e.id),
      ["id-b", "id-c", "id-d"]
    );

    // Date-only `to` includes whole day (5 PM on 2026-12-05 is included)
    const upToDec5 = filterEvents(original, { to: "2026-12-05" });
    assert.equal(upToDec5.length, 3);

    // Max price filters out events with no tiers or above maxPriceCents, and sorts cheapest first
    const pricedSearch = searchEvents(original, { maxPriceCents: 10000 }, "price");
    assert.deepEqual(
      pricedSearch.map((e) => e.id),
      ["id-a", "id-c", "id-b"]
    );

    // Sort by date: earlier first, same timestamp broken by title then id
    const byDate = sortEvents(original, "date");
    assert.deepEqual(
      byDate.map((e) => e.id),
      ["id-b", "id-a", "id-c", "id-d"]
    );

    // Sort by availability: most seats left first
    const byAvailability = sortEvents(original, "availability");
    assert.deepEqual(
      byAvailability.map((e) => e.id),
      ["id-c", "id-b", "id-a", "id-d"]
    );

    // Original list untouched
    assert.equal(JSON.stringify(original), snapshot);

    // Validation errors on bad date, non-integer price, or unknown sort option
    assertDomainError(() => filterEvents(original, { from: "bad-date" }), ErrorCodes.VALIDATION);
    assertDomainError(() => filterEvents(original, { maxPriceCents: 99.5 }), ErrorCodes.VALIDATION);
    assertDomainError(() => sortEvents(original, "unknown_sort"), ErrorCodes.VALIDATION);
  });

  it("S06: books 1-10 tickets, rejects over-capacity with SOLD_OUT, and rejects invalid quantities with VALIDATION", () => {
    const store = createStore();
    const ev = store.createEvent({
      title: "Workshop",
      city: "Enugu",
      venue: "Tech Hub",
      startsAt: "2026-12-18T10:00:00.000Z",
    });
    const tier = store.addTier(ev.id, { name: "General", priceCents: 2000, capacity: 3 });
    publishEvent(store, ev.id);

    const booking = store.bookTickets({ tierId: tier.id, attendeeName: "Ada", quantity: 2 });
    assert.equal(booking.quantity, 2);
    assert.equal(booking.totalCents, 4000);
    assert.equal(store.getTierStatus(tier.id).seatsLeft, 1);

    assertDomainError(
      () => store.bookTickets({ tierId: tier.id, attendeeName: "Bayo", quantity: 2 }),
      ErrorCodes.SOLD_OUT
    );
    assert.equal(store.getTierStatus(tier.id).seatsLeft, 1);

    for (const badQty of [0, -1, 1.5, 11]) {
      assertDomainError(
        () => store.bookTickets({ tierId: tier.id, attendeeName: "Chioma", quantity: badQty }),
        ErrorCodes.VALIDATION
      );
    }
  });

  it("handles empty lists, stability, and all domain error codes (VALIDATION, NOT_FOUND, SOLD_OUT, CONFLICT, INVALID_STATE)", () => {
    assert.deepEqual(filterEvents([]), []);
    assert.deepEqual(sortEvents([], "date"), []);
    assert.deepEqual(searchEvents([], {}, "price"), []);

    const tagged = [
      { key: 1, order: "first" },
      { key: 1, order: "second" },
      { key: 1, order: "third" },
    ];
    const sortedTagged = mergeSort(tagged, (a, b) => a.key - b.key);
    assert.deepEqual(
      sortedTagged.map((x) => x.order),
      ["first", "second", "third"]
    );

    const store = createStore();
    const noTierEv = store.createEvent({
      title: "Tierless Error Code Test",
      city: "Lagos",
      venue: "Arena",
      startsAt: "2026-12-22T12:00:00.000Z",
    });
    const ev = store.createEvent({
      title: "Error Code Test",
      city: "Lagos",
      venue: "Arena",
      startsAt: "2026-12-22T12:00:00.000Z",
    });
    const tier = store.addTier(ev.id, { name: "Std", priceCents: 1000, capacity: 1 });

    // INVALID_STATE, NOT_FOUND, VALIDATION, SOLD_OUT, CONFLICT
    assertDomainError(() => publishEvent(store, noTierEv.id), ErrorCodes.INVALID_STATE);
    assertDomainError(() => store.cancelBooking("TKT-MISSING"), ErrorCodes.NOT_FOUND);
    assertDomainError(() => store.createEvent({ title: "" }), ErrorCodes.VALIDATION);
    assertDomainError(
      () => store.bookTickets({ tierId: tier.id, attendeeName: "A", quantity: 2 }),
      ErrorCodes.SOLD_OUT
    );
    const b = store.bookTickets({ tierId: tier.id, attendeeName: "A", quantity: 1 });
    store.cancelBooking(b.reference);
    assertDomainError(() => store.cancelBooking(b.reference), ErrorCodes.CONFLICT);
  });
});