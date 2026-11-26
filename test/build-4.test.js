import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/http/app.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createMockPaymentGateway } from "../src/lib/mockPaymentGateway.js";
import { createAuthService } from "../src/services/authService.js";
import { createEventService } from "../src/services/eventService.js";
import { createBookingService } from "../src/services/bookingService.js";

describe("Build 4 REST API", () => {
  let server;
  let baseUrl;
  let repository;
  let organizerToken;
  let aliceToken;
  let bobToken;
  let carolToken;

  async function signupUser({ email, password, name, role }) {
    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name, role }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    return data.token;
  }

  before(async () => {
    repository = createMemoryRepository();
    const paymentGateway = createMockPaymentGateway();
    const authService = createAuthService(repository);
    const eventService = createEventService(repository);
    const bookingService = createBookingService(repository, paymentGateway);

    server = createApp({
      eventService,
      bookingService,
      authService,
      repository,
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;

    organizerToken = await signupUser({
      email: "org1@example.com",
      password: "Password123!",
      name: "Organizer One",
      role: "organizer",
    });
    aliceToken = await signupUser({
      email: "alice@example.com",
      password: "Password123!",
      name: "Alice",
      role: "attendee",
    });
    bobToken = await signupUser({
      email: "bob@example.com",
      password: "Password123!",
      name: "Bob",
      role: "attendee",
    });
    carolToken = await signupUser({
      email: "carol@example.com",
      password: "Password123!",
      name: "Carol",
      role: "attendee",
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("creates, adds tier, publishes, searches, books, declines then pays, and rejects second payment", async () => {
    const createEvtRes = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${organizerToken}`,
      },
      body: JSON.stringify({
        title: "Backend Craft",
        city: "Abuja",
        venue: "Civic Hall",
        startsAt: "2026-12-20T14:00:00.000Z",
      }),
    });
    assert.equal(createEvtRes.status, 201);
    const event = await createEvtRes.json();
    assert.equal(event.published, false);

    // Unpublished event should not appear in public search yet
    const hiddenRes = await fetch(`${baseUrl}/api/events?city=Abuja`);
    assert.equal(hiddenRes.status, 200);
    assert.equal((await hiddenRes.json()).events.length, 0);

    const addTierRes = await fetch(`${baseUrl}/api/events/${event.id}/tiers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${organizerToken}`,
      },
      body: JSON.stringify({
        name: "Standard",
        priceCents: 1500,
        capacity: 10,
      }),
    });
    assert.equal(addTierRes.status, 201);
    const tier = await addTierRes.json();
    assert.equal(tier.seatsLeft, 10);

    const pubRes = await fetch(`${baseUrl}/api/events/${event.id}/publish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${organizerToken}` },
    });
    assert.equal(pubRes.status, 200);
    const published = await pubRes.json();
    assert.equal(published.published, true);

    const searchRes = await fetch(`${baseUrl}/api/events?q=Craft&city=Abuja&sortBy=price`);
    assert.equal(searchRes.status, 200);
    const searchData = await searchRes.json();
    assert.equal(searchData.events.length, 1);

    const bookRes = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({
        tierId: tier.id,
        attendeeName: "Alice",
        quantity: 2,
      }),
    });
    assert.equal(bookRes.status, 201);
    const booking = await bookRes.json();
    assert.equal(booking.status, "pending");
    assert.equal(booking.totalCents, 3000);

    // Another user cannot pay for Alice's booking
    const wrongUserPayRes = await fetch(`${baseUrl}/api/bookings/${booking.reference}/pay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bobToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(wrongUserPayRes.status, 404);
    const wrongUserErr = await wrongUserPayRes.json();
    assert.equal(typeof wrongUserErr.error?.code, "string");
    assert.equal(typeof wrongUserErr.error?.message, "string");

    // Declined payment returns PAYMENT_DECLINED and leaves booking pending
    const declinePayRes = await fetch(`${baseUrl}/api/bookings/${booking.reference}/pay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({ decline: true }),
    });
    assert.equal(declinePayRes.status, 402);
    const declineErr = await declinePayRes.json();
    assert.equal(declineErr.error.code, "PAYMENT_DECLINED");

    // Subsequent successful payment succeeds
    const okPayRes = await fetch(`${baseUrl}/api/bookings/${booking.reference}/pay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(okPayRes.status, 200);
    const paidData = await okPayRes.json();
    assert.equal(paidData.booking.status, "paid");

    // Paying again is rejected with INVALID_TRANSITION
    const repeatPayRes = await fetch(`${baseUrl}/api/bookings/${booking.reference}/pay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${aliceToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(repeatPayRes.status, 409);
    const repeatPayErr = await repeatPayRes.json();
    assert.equal(repeatPayErr.error.code, "INVALID_TRANSITION");

    // Paid booking cannot be cancelled in Build 4 (unpaid bookings only)
    const cancelPaidRes = await fetch(`${baseUrl}/api/bookings/${booking.reference}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    assert.equal(cancelPaidRes.status, 409);
    const cancelPaidErr = await cancelPaidRes.json();
    assert.equal(cancelPaidErr.error.code, "INVALID_TRANSITION");
  });

  it("cancels a pending booking and restores seats", async () => {
    const evtRes = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${organizerToken}`,
      },
      body: JSON.stringify({
        title: "Cancelable Event",
        city: "Enugu",
        venue: "Main Hall",
        startsAt: "2026-12-25T12:00:00.000Z",
      }),
    });
    const evt = await evtRes.json();

    const tierRes = await fetch(`${baseUrl}/api/events/${evt.id}/tiers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${organizerToken}`,
      },
      body: JSON.stringify({ name: "VIP", priceCents: 5000, capacity: 5 }),
    });
    const tier = await tierRes.json();

    await fetch(`${baseUrl}/api/events/${evt.id}/publish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${organizerToken}` },
    });

    const bookRes = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${carolToken}`,
      },
      body: JSON.stringify({ tierId: tier.id, attendeeName: "Carol", quantity: 3 }),
    });
    const booking = await bookRes.json();

    const cancelRes = await fetch(`${baseUrl}/api/bookings/${booking.reference}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${carolToken}` },
    });
    assert.equal(cancelRes.status, 200);
    const cancelled = await cancelRes.json();
    assert.equal(cancelled.booking.status, "cancelled");
    assert.equal(cancelled.seatsLeft, 5);
  });
});