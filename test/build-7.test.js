import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/http/app.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createMockPaymentGateway } from "../src/lib/mockPaymentGateway.js";
import { createAuthService } from "../src/services/authService.js";
import { createEventService } from "../src/services/eventService.js";
import { createBookingService } from "../src/services/bookingService.js";
import { signToken } from "../src/lib/token.js";

describe("Build 7 Auth, RBAC, and Ownership", () => {
  let server;
  let baseUrl;
  let orgAToken;
  let orgBToken;
  let attAToken;
  let attBToken;

  async function signup(payload) {
    return fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  before(async () => {
    const repository = createMemoryRepository();
    const paymentGateway = createMockPaymentGateway();
    const authService = createAuthService(repository);
    const eventService = createEventService(repository);
    const bookingService = createBookingService(repository, paymentGateway);

    server = createApp({
      authService,
      eventService,
      bookingService,
      repository,
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;

    const r1 = await signup({
      email: "org-a@test.com",
      password: "Password123!",
      name: "Org A",
      role: "organizer",
    });
    assert.equal(r1.status, 201);
    orgAToken = (await r1.json()).token;

    const r2 = await signup({
      email: "org-b@test.com",
      password: "Password123!",
      name: "Org B",
      role: "organizer",
    });
    assert.equal(r2.status, 201);
    orgBToken = (await r2.json()).token;

    const r3 = await signup({
      email: "att-a@test.com",
      password: "Password123!",
      name: "Attendee A",
      role: "attendee",
    });
    assert.equal(r3.status, 201);
    attAToken = (await r3.json()).token;

    const r4 = await signup({
      email: "att-b@test.com",
      password: "Password123!",
      name: "Attendee B",
      role: "attendee",
    });
    assert.equal(r4.status, 201);
    attBToken = (await r4.json()).token;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("handles signup, duplicate email conflict, login, me, and bad/expired/missing tokens", async () => {
    const dupRes = await signup({
      email: "org-a@test.com",
      password: "Password123!",
      name: "Dup",
      role: "organizer",
    });
    assert.equal(dupRes.status, 409);
    assert.equal((await dupRes.json()).error.code, "EMAIL_TAKEN");

    const badLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "org-a@test.com", password: "WrongPassword!" }),
    });
    assert.equal(badLogin.status, 401);
    assert.equal((await badLogin.json()).error.code, "INVALID_CREDENTIALS");

    const okLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "org-a@test.com", password: "Password123!" }),
    });
    assert.equal(okLogin.status, 200);
    const { token } = await okLogin.json();

    const meOk = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(meOk.status, 200);
    const meData = await meOk.json();
    assert.equal(meData.user.email, "org-a@test.com");
    assert.equal(meData.user.role, "organizer");

    const meMissing = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(meMissing.status, 401);

    const expiredToken = signToken(
      { sub: "some-id", email: "org-a@test.com", role: "organizer" },
      { expiresInSeconds: 10, nowSeconds: Math.floor(Date.now() / 1000) - 60 }
    );
    const meExpired = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    assert.equal(meExpired.status, 401);
  });

  it("enforces role permissions and ownership across events and bookings", async () => {
    // Attendee cannot create an event
    const attCreateEvt = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${attAToken}`,
      },
      body: JSON.stringify({
        title: "Unauthorized Event",
        city: "Lagos",
        venue: "Eko Hotel",
        startsAt: "2026-12-28T18:00:00.000Z",
      }),
    });
    assert.equal(attCreateEvt.status, 403);
    assert.equal((await attCreateEvt.json()).error.code, "FORBIDDEN");

    // Organizer A creates and publishes an event
    const evtRes = await fetch(`${baseUrl}/api/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${orgAToken}`,
      },
      body: JSON.stringify({
        title: "Lagos Systems Summit",
        city: "Lagos",
        venue: "Landmark",
        startsAt: "2026-12-28T18:00:00.000Z",
      }),
    });
    assert.equal(evtRes.status, 201);
    const evt = await evtRes.json();

    // Organizer B cannot add a tier or publish Organizer A's event
    const orgBAddTier = await fetch(`${baseUrl}/api/events/${evt.id}/tiers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${orgBToken}`,
      },
      body: JSON.stringify({ name: "VIP", priceCents: 10000, capacity: 20 }),
    });
    assert.equal(orgBAddTier.status, 403);
    assert.equal((await orgBAddTier.json()).error.code, "FORBIDDEN");

    const tierRes = await fetch(`${baseUrl}/api/events/${evt.id}/tiers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${orgAToken}`,
      },
      body: JSON.stringify({ name: "VIP", priceCents: 10000, capacity: 20 }),
    });
    assert.equal(tierRes.status, 201);
    const tier = await tierRes.json();

    const orgBPublish = await fetch(`${baseUrl}/api/events/${evt.id}/publish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${orgBToken}` },
    });
    assert.equal(orgBPublish.status, 403);

    const orgAPublish = await fetch(`${baseUrl}/api/events/${evt.id}/publish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${orgAToken}` },
    });
    assert.equal(orgAPublish.status, 200);

    // Organizer cannot book tickets
    const orgBook = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${orgAToken}`,
      },
      body: JSON.stringify({ tierId: tier.id, attendeeName: "Org A", quantity: 1 }),
    });
    assert.equal(orgBook.status, 403);

    // Attendee A books tickets
    const bookRes = await fetch(`${baseUrl}/api/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${attAToken}`,
      },
      body: JSON.stringify({ tierId: tier.id, attendeeName: "Attendee A", quantity: 2 }),
    });
    assert.equal(bookRes.status, 201);
    const booking = await bookRes.json();

    // Attendee B cannot pay or cancel Attendee A's booking (404 NOT_FOUND)
    const attBPay = await fetch(`${baseUrl}/api/bookings/${booking.reference}/pay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${attBToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(attBPay.status, 404);

    const attBCancel = await fetch(`${baseUrl}/api/bookings/${booking.reference}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${attBToken}` },
    });
    assert.equal(attBCancel.status, 404);
  });
});